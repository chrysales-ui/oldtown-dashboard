import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useRestaurantData } from '../hooks/useRestaurantData';
import Nav from '../components/Nav';

// ── Helpers ───────────────────────────────────────────────────────────────────
function addDays(d, n) {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

function sumW(arr, s, e, keys) {
  const a = Object.fromEntries(keys.map(k => [k, 0]));
  (arr || []).forEach(r => {
    if (r.date >= s && r.date <= e) keys.forEach(k => { a[k] += (r[k] || 0); });
  });
  return a;
}

function sumCampPeriod(arr, s, e, nameKey, keys) {
  const out = {};
  (arr || []).forEach(r => {
    if (!r.date || r.date < s || r.date > e) return;
    const k = r[nameKey];
    if (!k) return;
    if (!out[k]) out[k] = { name: k, ...Object.fromEntries(keys.map(key => [key, 0])) };
    keys.forEach(key => { out[k][key] = (out[k][key] || 0) + (r[key] || 0); });
  });
  return Object.values(out).sort((a, b) => b.spend - a.spend);
}

function pct(a, b) { return b > 0 ? ((a - b) / b * 100) : null; }
function fmtD(n)  { return '$' + (n || 0).toLocaleString('en-CA', { maximumFractionDigits: 0 }); }
function fmtD2(n) { return '$' + (n || 0).toFixed(2); }
function fmtN(n)  { return (n || 0).toLocaleString('en-CA', { maximumFractionDigits: 0 }); }

function fmtShortRange(s, e) {
  const fmt = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(s)} – ${fmt(e)}`;
}

// ── compute ───────────────────────────────────────────────────────────────────
function compute(data, cs, end) {
  if (!data) return null;
  const span = Math.round((new Date(end + 'T00:00:00Z') - new Date(cs + 'T00:00:00Z')) / 86400000);
  const pe = addDays(cs, -1);
  const ps = addDays(pe, -span);

  const FB_KEYS  = ['spend', 'leadSpend', 'resultsCount', 'reach', 'impressions', 'clicks', 'otReservations'];
  const GA_KEYS  = ['spend', 'reservations', 'storeVisits', 'calls'];
  const RES_KEYS = ['reservations', 'covers', 'seatedRes', 'ltpcSum', 'ltpcCount'];
  const PV_KEYS  = ['leads', 'completed', 'lost', 'groupSize', 'proposalTotal', 'revenueValue'];
  const FBL_KEYS = ['leads', 'matched', 'newGuests', 'returning', 'pvMatched', 'pePvMatched', 'pePvMatchedRevenue', 'metaLeadRevenue'];
  const SEO_KEYS = ['clicks', 'impressions'];
  const seo  = sumW(data.seo?.daily, cs, end, SEO_KEYS);
  const seop = sumW(data.seo?.daily, ps, pe,  SEO_KEYS);
  const seoClicksPct = pct(seo.clicks, seop.clicks);

  const fb   = sumW(data.facebook?.daily,              cs, end, FB_KEYS);
  const fbp  = sumW(data.facebook?.daily,              ps, pe,  FB_KEYS);
  const ga   = sumW(data.googleAds?.daily,             cs, end, GA_KEYS);
  const gap  = sumW(data.googleAds?.daily,             ps, pe,  GA_KEYS);
  const res  = sumW(data.reservations?.daily,          cs, end, RES_KEYS);
  const resp = sumW(data.reservations?.daily,          ps, pe,  RES_KEYS);
  const fv   = sumW(data.reservations?.firstVisitDaily, cs, end, ['firstVisit']);
  const fvp  = sumW(data.reservations?.firstVisitDaily, ps, pe,  ['firstVisit']);
  const pv   = sumW(data.perfectVenue?.daily,          cs, end, PV_KEYS);
  const pvp  = sumW(data.perfectVenue?.daily,          ps, pe,  PV_KEYS);
  const fbl  = { ...sumW(data.fbLeads?.daily, cs, end, FBL_KEYS), pePvMatchedRevenue: data.fbLeads?.summary?.pePvMatchedRevenue || 0 };
  const fblp = sumW(data.fbLeads?.daily,               ps, pe,  FBL_KEYS);

  const metaTotalSpend  = fb.spend;
  const metaTotalSpendP = fbp.spend;
  const metaLeadSpend   = fb.leadSpend > 0 ? fb.leadSpend : fb.spend;
  const metaLeadSpendP  = fbp.leadSpend > 0 ? fbp.leadSpend : fbp.spend;
  const metaResults     = fb.resultsCount;
  const metaResultsP    = fbp.resultsCount;

  const googleSpend  = ga.spend;
  const totalSpend   = metaTotalSpend + googleSpend;
  const totalSpendP  = metaTotalSpendP + gap.spend;

  const avgPartySize  = res.reservations > 0 ? res.covers / res.reservations : 0;
  const avgPartySizeP = resp.reservations > 0 ? resp.covers / resp.reservations : 0;
  const spendPerRes  = res.ltpcCount  > 0 ? res.ltpcSum  / res.ltpcCount  : 0;
  const spendPerResP = resp.ltpcCount > 0 ? resp.ltpcSum / resp.ltpcCount : 0;

  const pvCloseRate  = pv.leads  > 0 ? (pv.completed  / pv.leads  * 100) : 0;
  const pvCloseRateP = pvp.leads > 0 ? (pvp.completed / pvp.leads * 100) : 0;

  const metaCPL  = metaResults > 0 ? metaLeadSpend / metaResults : 0;
  const metaCPLP = metaResultsP > 0 ? metaLeadSpendP / metaResultsP : 0;

  const totalRes  = ga.reservations + fbl.matched + (fb.otReservations || 0);
  const totalResP = gap.reservations + fblp.matched + (fbp.otReservations || 0);

  const gaCamps = sumCampPeriod(data.googleAds?.campDaily || [], cs, end, 'name',
    ['spend', 'clicks', 'impressions', 'reservations', 'storeVisits', 'calls']);
  const fbCamps = sumCampPeriod(data.facebook?.campDaily || [], cs, end, 'campaign',
    ['spend', 'leadSpend', 'resultsCount']);
  const fbCampsP = sumCampPeriod(data.facebook?.campDaily || [], ps, pe, 'campaign',
    ['spend', 'leadSpend', 'resultsCount']);

  const peCamp    = fbCamps.find(c => c.name?.toLowerCase().includes('private event') || c.name?.toLowerCase().includes('group booking'));
  const peCampP   = fbCampsP.find(c => c.name?.toLowerCase().includes('private event') || c.name?.toLowerCase().includes('group booking'));
  const peGaCamp  = gaCamps.find(c => c.name === 'GG | Search - Private Events');
  const peMetaSpend   = peCamp?.spend || 0;
  const peMetaSpendP  = peCampP?.spend || 0;
  const peMetaLeads   = peCamp?.resultsCount || 0;
  const peMetaLeadsP  = peCampP?.resultsCount || 0;
  const peMetaCPL     = peMetaLeads > 0 ? peMetaSpend / peMetaLeads : 0;
  const peGoogleSpend = peGaCamp?.spend || 0;
  const peTotalSpend  = peMetaSpend + peGoogleSpend;

  const diningMetaSpend    = metaTotalSpend - peMetaSpend;
  const diningGoogleSpend  = googleSpend - peGoogleSpend;
  const diningMetaSpendP   = metaTotalSpendP - peMetaSpendP;
  const peGaCampP        = sumCampPeriod(data.googleAds?.campDaily || [], ps, pe, 'name', ['spend']).find(c => c.name === 'GG | Search - Private Events');
  const peGoogleSpendP   = peGaCampP?.spend || 0;
  const diningGoogleSpendP = gap.spend - peGoogleSpendP;
  const diningTotalSpend   = diningMetaSpend + diningGoogleSpend;
  const diningTotalSpendP  = diningMetaSpendP + diningGoogleSpendP;
  const blendedCPR  = totalRes  > 0 ? diningTotalSpend  / totalRes  : 0;
  const blendedCPRP = totalResP > 0 ? diningTotalSpendP / totalResP : 0;
  const gCostPerRes  = ga.reservations  > 0 ? diningGoogleSpend  / ga.reservations  : 0;
  const gCostPerResP = gap.reservations > 0 ? diningGoogleSpendP / gap.reservations : 0;

  const metaCPLPct = pct(metaCPL, metaCPLP);
  const gResPct    = pct(ga.reservations, gap.reservations);
  const totalResPct = pct(totalRes, totalResP);
  const pvLdPct    = pct(pv.leads, pvp.leads);
  const resPct     = pct(res.reservations, resp.reservations);
  const fvPct      = pct(fv.firstVisit, fvp.firstVisit);
  const gCPRPct    = pct(gCostPerRes, gCostPerResP);

  // Dining leads = all [Lead] campaigns except Private Event / Group Booking
  const diningMetaResults  = metaResults  - peMetaLeads;
  const diningMetaResultsP = metaResultsP - peMetaLeadsP;
  const diningLeadSpend    = metaLeadSpend  - peMetaSpend;
  const diningLeadSpendP   = metaLeadSpendP - peMetaSpendP;
  const diningMetaCPL      = diningMetaResults  > 0 ? diningLeadSpend  / diningMetaResults  : 0;
  const diningMetaCPLP     = diningMetaResultsP > 0 ? diningLeadSpendP / diningMetaResultsP : 0;
  const diningMetaCPLPct   = pct(diningMetaCPL, diningMetaCPLP);

  // Big Win — find the most impressive result to highlight
  // Score = |pct improvement| × log(volume) so big numbers on small bases don't win
  const wins = [];

  // Campaign CPL improvements — min 10 leads this period
  fbCamps.filter(c => c.resultsCount >= 10 && c.leadSpend > 0).forEach(c => {
    const prev = fbCampsP.find(p => p.name === c.name);
    const currCPL = c.leadSpend / c.resultsCount;
    const prevCPL = prev?.resultsCount > 0 ? prev.leadSpend / prev.resultsCount : 0;
    const imp = pct(currCPL, prevCPL);
    if (prevCPL > 0 && imp != null && imp < -20) {
      wins.push({
        score: Math.abs(imp) * Math.log10(c.resultsCount + 1),
        label: c.name.replace('[Lead] ', '').replace('[Awareness] ', '') + ' · cost per lead',
        prevVal: fmtD2(prevCPL), prevSub: `${fmtShortRange(ps, pe)} · ${fmtN(prev.resultsCount)} leads`,
        currVal: fmtD2(currCPL), currSub: `${fmtShortRange(cs, end)} · ${fmtN(c.resultsCount)} leads`,
        pctVal: imp, pctLabel: 'cost per lead improvement',
      });
    }
  });

  // Google reservations increase — min 10 reservations this period
  if (gResPct != null && gResPct >= 20 && ga.reservations >= 10) {
    wins.push({
      score: gResPct * Math.log10(ga.reservations + 1),
      label: 'Google Ads · reservations driven',
      prevVal: fmtN(gap.reservations), prevSub: fmtShortRange(ps, pe),
      currVal: fmtN(ga.reservations), currSub: fmtShortRange(cs, end),
      pctVal: gResPct, pctLabel: 'more reservations',
    });
  }

  // Blended CPR improvement — min 10 total reservations
  const blendedCPRPct = pct(blendedCPR, blendedCPRP);
  if (blendedCPRPct != null && blendedCPRPct < -20 && totalRes >= 10) {
    wins.push({
      score: Math.abs(blendedCPRPct) * Math.log10(totalRes + 1),
      label: 'Blended cost per reservation',
      prevVal: fmtD2(blendedCPRP), prevSub: fmtShortRange(ps, pe),
      currVal: fmtD2(blendedCPR), currSub: fmtShortRange(cs, end),
      pctVal: blendedCPRPct, pctLabel: 'cost per reservation improvement',
    });
  }

  // PE leads matched in Perfect Venue — min 5 matched
  const pePvMatched = fbl.pePvMatched || 0;
  const pePvMatchRate = peMetaLeads > 0 ? pePvMatched / peMetaLeads * 100 : 0;
  if (pePvMatched >= 5 && pePvMatchRate >= 20) {
    wins.push({
      score: pePvMatchRate * Math.log10(pePvMatched + 1),
      label: 'Private event leads · matched in Perfect Venue',
      prevVal: fmtN(peMetaLeads), prevSub: `leads captured · ${fmtD2(peMetaCPL)} CPL`,
      currVal: fmtN(pePvMatched), currSub: 'inquiries found in Perfect Venue',
      pctVal: pePvMatchRate, pctLabel: 'of leads became PV inquiries',
    });
  }

  // Pick the win with the highest score
  wins.sort((a, b) => b.score - a.score);
  const bigWin = wins[0] || null;

  // What Happened summary
  const whatHappened = [
    `${fmtD(totalSpend)} in ad spend generated ${fmtN(totalRes)} reservations this period${blendedCPR > 0 ? ' at ' + fmtD(blendedCPR) + ' per reservation' : ''}.`,
    diningMetaResults > 0 ? `Meta generated ${fmtN(diningMetaResults)} dining leads at ${fmtD2(diningMetaCPL)} CPL${diningMetaCPLPct != null ? ` — ${Math.abs(diningMetaCPLPct).toFixed(0)}% ${diningMetaCPLPct < 0 ? 'more efficient' : 'higher'} than the prior period` : ''}.` : null,
    ga.reservations > 0 ? `Google Ads delivered ${fmtN(ga.reservations)} reservations at ${fmtD2(gCostPerRes)} each${gResPct != null ? ` (${gResPct >= 0 ? '+' : ''}${gResPct.toFixed(0)}% vs prior period)` : ''}.` : null,
    spendPerRes > 0 ? `Guests who visited spent an average of ${fmtD(spendPerRes)} per reservation.` : null,
    pv.revenueValue > 0 ? `Private events generated ${fmtD(pv.revenueValue)} in revenue across ${fmtN(pv.completed)} confirmed event${pv.completed !== 1 ? 's' : ''}${peTotalSpend > 0 ? ` supported by ${fmtD(peTotalSpend)} in targeted ads` : ''}.` : null,
  ].filter(Boolean);

  // Actions — fully data-driven, no fillers
  const actions = [];
  const unbooked = diningMetaResults - fbl.matched;

  // Google: reservations up and efficient → scale
  if (gResPct != null && gResPct >= 10 && gCostPerRes > 0)
    actions.push({ title: 'Scale Google budget', body: `Reservations are up ${gResPct.toFixed(0)}% at ${fmtD2(gCostPerRes)}/res — campaigns are performing well. Consider increasing budget to capture more demand before limits are reached.` });

  // Google: reservations down → review
  if (gResPct != null && gResPct <= -15 && gap.reservations > 0)
    actions.push({ title: 'Review Google campaign performance', body: `Reservations are ${Math.abs(gResPct).toFixed(0)}% below the prior period (${fmtN(gap.reservations)} → ${fmtN(ga.reservations)}). A review of budget pacing, bid strategy, and tracking is recommended.` });

  // Google: cost/res increased
  if (gCPRPct != null && gCPRPct > 25 && gCostPerResP > 0)
    actions.push({ title: 'Optimize Google efficiency', body: `Cost per reservation has shifted ${gCPRPct.toFixed(0)}% (${fmtD2(gCostPerResP)} → ${fmtD2(gCostPerRes)}). Reviewing bid strategy and search term targeting can improve efficiency.` });

  // Meta: unbooked dining leads → follow up
  if (unbooked >= 5)
    actions.push({ title: `Re-engage ${fmtN(unbooked)} warm leads`, body: `${fmtN(unbooked)} of ${fmtN(diningMetaResults)} dining leads haven't reserved yet — they expressed interest and are still within the warm window. An SMS or email within 30–90 days can convert them.` });

  // Meta: returning guests in audience → refine
  if (fbl.returning > 0 && diningMetaResults > 0)
    actions.push({ title: 'Refine Meta audience targeting', body: `${fmtN(fbl.returning)} of ${fmtN(fbl.matched)} matched leads are returning guests. Refining the audience to focus on new guest acquisition can improve cost efficiency.` });

  // Meta: CPL increased
  if (diningMetaCPLPct != null && diningMetaCPLPct > 25 && diningMetaCPLP > 0)
    actions.push({ title: 'Refresh Meta ad creative', body: `Cost per lead has shifted ${diningMetaCPLPct.toFixed(0)}% (${fmtD2(diningMetaCPLP)} → ${fmtD2(diningMetaCPL)}). Testing fresh creative or refining audience targeting can bring efficiency back.` });

  // Meta: low lead volume
  if (diningMetaResults < 10 && diningMetaSpend > 200)
    actions.push({ title: 'Boost Meta lead volume', body: `${fmtN(diningMetaResults)} leads generated on ${fmtD(diningMetaSpend)} spend. Reviewing form load speed, audience size, and campaign learning phase can unlock more volume.` });

  // PV: open leads → follow up urgently
  const pvOpen = pv.leads - pv.completed - pv.lost;
  if (pvOpen > 0)
    actions.push({ title: `Respond to ${pvOpen} open private event ${pvOpen === 1 ? 'inquiry' : 'inquiries'}`, body: `${pvOpen} private event ${pvOpen === 1 ? 'inquiry is' : 'inquiries are'} awaiting proposals. Responding within 24–48 hours significantly improves close rate.` });

  // PV: close rate shifted
  if (pvCloseRate > 0 && pvCloseRateP > 0 && pvCloseRate < pvCloseRateP - 10)
    actions.push({ title: 'Review private event close rate', body: `Close rate is at ${pvCloseRate.toFixed(0)}% vs ${pvCloseRateP.toFixed(0)}% in the prior period. Reviewing proposal timing and pricing can help recover momentum.` });

  // SEO: clicks shifted down
  if (seoClicksPct != null && seoClicksPct <= -15 && seop.clicks > 0)
    actions.push({ title: 'Review organic search performance', body: `Organic clicks are ${Math.abs(seoClicksPct).toFixed(0)}% below the prior period (${fmtN(seop.clicks)} → ${fmtN(seo.clicks)}). A review of Google Search Console for ranking or indexing changes is recommended.` });

  // SEO: clicks up → capitalize
  if (seoClicksPct != null && seoClicksPct >= 20 && seo.clicks > 50)
    actions.push({ title: 'Build on SEO momentum', body: `Organic clicks are up ${seoClicksPct.toFixed(0)}% to ${fmtN(seo.clicks)} this period — strong signal. Identifying top landing pages and improving conversion paths can turn this traffic into reservations.` });

  // New guests high → retention opportunity
  if (fbl.newGuests >= 5)
    actions.push({ title: 'Welcome new guests back', body: `${fmtN(fbl.newGuests)} first-time guests visited this period from Meta. Reaching out within 30 days with a personal email or SMS is the highest-ROI retention action.` });

  // Cap at top 6
  actions.splice(6);

  return {
    cs, end, ps, pe,
    fb, fbp, ga, gap, res, resp, fv, fvp, pv, pvp, fbl, fblp,
    metaTotalSpend, metaTotalSpendP, metaLeadSpend, metaLeadSpendP,
    metaResults, metaResultsP, metaCPL, metaCPLP, metaCPLPct,
    googleSpend, totalSpend, totalSpendP,
    diningMetaSpend, diningMetaSpendP, diningGoogleSpend, diningGoogleSpendP, peTotalSpend,
    avgPartySize, avgPartySizeP,
    spendPerRes, spendPerResP,
    pvCloseRate, pvCloseRateP,
    gCostPerRes, gCostPerResP,
    totalRes, blendedCPR, totalResP, blendedCPRP,
    peMetaSpend, peMetaLeads, peMetaLeadsP, peMetaCPL, peGoogleSpend, peTotalSpend,

    seo, seop, seoClicksPct,
    gaCamps, fbCamps, fbCampsP,
    diningMetaResults, diningMetaResultsP, diningMetaCPL, diningMetaCPLP, diningMetaCPLPct,
    gResPct, totalResPct, pvLdPct, resPct, fvPct, gCPRPct, unbooked,
    metaLeadRevenue: fbl.metaLeadRevenue || 0,
    bigWin, whatHappened,
    actions,
  };
}

// ── Expandable ────────────────────────────────────────────────────────────────
function Expand({ label, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E0D8', borderRadius: 10, overflow: 'hidden', marginBottom: 10 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', border: 'none', background: 'none', padding: '14px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'pointer', fontSize: 14, color: '#7A7A72', fontFamily: "'DM Sans', sans-serif",
          textAlign: 'left',
        }}
      >
        {label}
        <span style={{ fontSize: 11, color: '#2D5A3D' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ borderTop: '1px solid #E2E0D8', padding: '14px 20px 16px', fontSize: 14, color: '#7A7A72', lineHeight: 1.75 }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Channel expand ────────────────────────────────────────────────────────────
function ChExpand({ label, children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', border: 'none', background: 'none', borderTop: '1px solid #E2E0D8',
          padding: '12px 22px', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', cursor: 'pointer', fontSize: 12, color: '#AEADA6',
          letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'DM Sans', sans-serif",
          textAlign: 'left',
        }}
      >
        {label} <span style={{ fontSize: 11, color: '#2D5A3D' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 22px 18px' }}>
          {children}
        </div>
      )}
    </>
  );
}

// ── MiniTable ─────────────────────────────────────────────────────────────────
function MiniTable({ headers, rows, footerRow, note }) {
  const thS = {
    fontSize: 12, color: '#AEADA6', letterSpacing: '0.08em', textTransform: 'uppercase',
    padding: '8px 0', borderBottom: '1px solid #E2E0D8', textAlign: 'left', fontWeight: 500,
  };
  const tdS = {
    padding: '8px 0', borderBottom: '1px solid rgba(226,224,216,0.5)', color: '#7A7A72',
  };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr>{headers.map((h, i) => <th key={i} style={{ ...thS, textAlign: i > 0 ? 'right' : 'left' }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ ...tdS, color: ci === 0 ? '#1A1A1A' : '#7A7A72', textAlign: ci > 0 ? 'right' : 'left', fontFamily: ci > 0 ? "'DM Mono', monospace" : 'inherit', fontSize: ci > 0 ? 14 : 14 }}>{cell}</td>
              ))}
            </tr>
          ))}
          {footerRow && (
            <tr>
              {footerRow.map((cell, ci) => (
                <td key={ci} style={{ ...tdS, borderBottom: 'none', borderTop: '1px solid #E2E0D8', fontWeight: 600, color: '#1A1A1A', textAlign: ci > 0 ? 'right' : 'left', fontFamily: ci > 0 ? "'DM Mono', monospace" : 'inherit' }}>{cell}</td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
      {note && <div style={{ fontSize: 14, color: '#AEADA6', marginTop: 10 }}>{note}</div>}
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────
export default function Scorecard({ restaurant }) {
  const { slug } = useParams();
  const { data, loading } = useRestaurantData(slug);

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = addDays(today, -1);
  const [endDate,   setEndDate]   = useState(yesterday);
  const [startDate, setStartDate] = useState(addDays(yesterday, -13));
  const [activePreset, setActivePreset] = useState(14);

  const setPreset = (days) => {
    const e = yesterday;
    const s = addDays(e, -(days - 1));
    setEndDate(e);
    setStartDate(s);
    setActivePreset(days);
  };

  const presets = [
    { label: '7d',  days: 7 },
    { label: '14d', days: 14 },
    { label: '30d', days: 30 },
    { label: '90d', days: 90 },
    { label: 'MTD', days: new Date().getDate() - 1 },
  ];

  const c = useMemo(() => {
    if (!data) return null;
    return compute(data, startDate, endDate);
  }, [data, startDate, endDate]);

  const inputS = {
    background: '#fff', border: '1px solid #E2E0D8', color: '#1A1A1A',
    borderRadius: 6, padding: '5px 8px', fontSize: 12, fontFamily: "'DM Mono', monospace",
  };

  // Colors
  const green    = '#2D5A3D';
  const greenMid = '#2D7A4F';
  const amber    = '#C4851C';
  const red      = '#B84233';
  const muted    = '#52524A';
  const dim      = '#8A8A82';
  const border   = '#E2E0D8';
  const bg       = '#F7F6F2';
  const white    = '#FFFFFF';

  const periodLabel = c ? fmtShortRange(c.cs, c.end) : fmtShortRange(startDate, endDate);

  // Delta chip
  const chip = (val, goodUp = true) => {
    if (val == null) return null;
    const up = val >= 0;
    const good = goodUp ? up : !up;
    const sign = up ? '↑' : '↓';
    const color = good ? greenMid : red;
    const bgc = good ? 'rgba(45,122,79,0.08)' : 'rgba(184,66,51,0.08)';
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, marginTop: 6, padding: '3px 8px', borderRadius: 5, color, background: bgc }}>
        {sign} {Math.abs(val).toFixed(0)}% vs prev
      </span>
    );
  };

  const statRow = (label, val, colorClass) => {
    const color = colorClass === 'g' ? greenMid : colorClass === 'r' ? red : colorClass === 'a' ? amber : '#1A1A1A';
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '7px 0', borderBottom: `1px solid ${border}` }}>
        <span style={{ fontSize: 14, color: '#5A5A52', flexShrink: 0 }}>{label}</span>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 600, color, textAlign: 'right' }}>{val}</span>
      </div>
    );
  };

  return (
    <div style={{ background: bg, minHeight: '100vh', fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", color: '#1A1A1A', fontSize: 16 }}>
      <style>{`
        .sc-3col { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
        .sc-3col-sm { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; margin-bottom: 32px; }
        .sc-2col { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2px; }
        .sc-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .sc-wrap { max-width: 1040px; margin: 0 auto; padding: 40px 40px 80px; }
        .sc-subheader { background: #fff; border-bottom: 1px solid #E2E0D8; padding: 12px 40px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 52px; z-index: 40; flex-wrap: wrap; gap: 8px; }
        .sc-subheader-left { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .sc-subheader-name { font-family: 'Playfair Display', Georgia, serif; font-size: 21px; color: #2D5A3D; white-space: nowrap; }
        .sc-subheader-controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .sc-preset-group { display: flex; gap: 4px; flex-wrap: wrap; }
        @media (max-width: 900px) {
          .sc-3col { grid-template-columns: 1fr; }
          .sc-3col-sm { grid-template-columns: 1fr; }
          .sc-2col { grid-template-columns: 1fr; }
          .sc-actions { grid-template-columns: repeat(2, 1fr); }
          .sc-wrap { padding: 24px 20px 60px; }
          .sc-subheader { padding: 10px 20px; top: 48px; }
          .sc-subheader-name { font-size: 18px; }
        }
        @media (max-width: 600px) {
          .sc-actions { grid-template-columns: 1fr; }
          .sc-wrap { padding: 16px 14px 40px; }
          .sc-subheader { padding: 8px 14px; position: static; }
          .sc-subheader-name { font-size: 16px; }
          .sc-subheader-controls input[type=date] { font-size: 11px; padding: 4px 6px; }
        }
      `}</style>
      {/* Nav */}
      <Nav restaurantName={restaurant?.name} />

      {/* Sticky sub-header */}
      <div className="sc-subheader">
        <div className="sc-subheader-left">
          <span className="sc-subheader-name">{restaurant?.name || slug}</span>
          <div className="sc-subheader-controls">
            <input type="date" value={startDate} max={endDate} onChange={e => setStartDate(e.target.value)} style={inputS} />
            <span style={{ color: muted, fontSize: 13 }}>–</span>
            <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} style={inputS} />
            <div className="sc-preset-group" style={{ marginLeft: 4 }}>
              {presets.map(p => p.days > 0 && (
                <button key={p.label} onClick={() => setPreset(p.days)} style={{
                  fontSize: 11, padding: '3px 8px', borderRadius: 5, cursor: 'pointer', fontFamily: "'DM Mono', monospace",
                  border: `1px solid ${activePreset === p.days ? green : border}`,
                  background: activePreset === p.days ? green : bg,
                  color: activePreset === p.days ? '#fff' : muted,
                }}>{p.label}</button>
              ))}
            </div>
          </div>
        </div>
        <span style={{ fontSize: 12, color: green, background: 'rgba(45,90,61,0.07)', border: '1px solid rgba(45,90,61,0.2)', padding: '4px 12px', borderRadius: 20, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
          Guest Getter
        </span>
      </div>

      <div className="sc-wrap">
        {loading && (
          <div style={{ color: muted, textAlign: 'center', padding: '80px 0' }}>Loading scorecard…</div>
        )}
        {!loading && !c && (
          <div style={{ color: dim, textAlign: 'center', padding: '80px 0' }}>No data available for this period.</div>
        )}

        {!loading && c && (<>

          {/* ── TOP SCORECARD ROW ── */}
          <div className="sc-3col-sm">
            {/* Total spend */}
            <div style={{ background: white, padding: '32px 28px 24px', borderRadius: '14px 0 0 14px', borderTop: `3px solid ${green}` }}>
              <div style={{ fontSize: 11, color: '#8A8A82', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 14, fontWeight: 600 }}>Total ad spend</div>
              <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 52, color: green, lineHeight: 1 }}>{fmtD(c.totalSpend)}</div>
              <div style={{ fontSize: 14, color: '#52524A', marginTop: 10, lineHeight: 1.65 }}>
                Reservations {fmtD(c.diningMetaSpend + c.diningGoogleSpend)} (Meta {fmtD(c.diningMetaSpend)} · Google {fmtD(c.diningGoogleSpend)}){c.peTotalSpend > 0 ? ` · Private Events ${fmtD(c.peTotalSpend)} (Meta ${fmtD(c.peMetaSpend)} · Google ${fmtD(c.peGoogleSpend)})` : ''}
              </div>
            </div>
            {/* Reservations */}
            <div style={{ background: white, padding: '32px 28px 24px', borderTop: '3px solid transparent' }}>
              <div style={{ fontSize: 11, color: '#8A8A82', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 14, fontWeight: 600 }}>Reservations driven</div>
              <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 52, color: green, lineHeight: 1 }}>{fmtN(c.totalRes)}</div>
              <div style={{ fontSize: 14, color: '#52524A', marginTop: 10, lineHeight: 1.65 }}>{fmtN(c.ga.reservations)} Google · {fmtN(c.fbl.matched)} Meta leads{c.fb.otReservations > 0 ? ` · ${fmtN(c.fb.otReservations)} Meta pixel` : ''}</div>
              {c.totalResPct != null && chip(c.totalResPct, true)}
            </div>
            {/* Cost per reservation */}
            <div style={{ background: white, padding: '32px 28px 24px', borderRadius: '0 14px 14px 0', borderTop: '3px solid transparent' }}>
              <div style={{ fontSize: 11, color: '#8A8A82', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 14, fontWeight: 600 }}>Cost per dining reservation</div>
              <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 52, color: c.blendedCPR > 50 ? amber : green, lineHeight: 1 }}>{c.blendedCPR > 0 ? fmtD(c.blendedCPR) : '—'}</div>
              {c.spendPerRes > 0 && (
                <div style={{ fontSize: 14, color: '#52524A', marginTop: 10, lineHeight: 1.65 }}>
                  Avg spend per reservation: <strong style={{ color: green, fontSize: 14 }}>{fmtD(c.spendPerRes)}</strong>
                </div>
              )}
              {c.blendedCPR > 0 && c.spendPerRes > 0 && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, marginTop: 6, padding: '3px 8px', borderRadius: 5, color: greenMid, background: 'rgba(45,122,79,0.08)' }}>
                  ↑ {(c.spendPerRes / c.blendedCPR).toFixed(0)}× ROI — {fmtD(c.blendedCPR)} to acquire, {fmtD(c.spendPerRes)} revenue per reservation{(c.metaLeadRevenue > 0 || (c.ga.reservations > 0 && c.spendPerRes > 0)) ? ` · ${fmtD((c.metaLeadRevenue || 0) + (c.ga.reservations * c.spendPerRes || 0))} est. total revenue` : ''}
                </div>
              )}
            </div>
          </div>

          {/* ── WHAT HAPPENED ── */}
          {c.whatHappened?.length > 0 && (
            <div style={{ background: white, borderRadius: 14, border: `1px solid ${border}`, padding: '22px 26px', marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: '#8A8A82', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 14 }}>What happened</div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {c.whatHappened.map((line, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ color: amber, fontSize: 16, lineHeight: 1.5, flexShrink: 0 }}>·</span>
                    <span style={{ fontSize: 15, color: '#3A3A32', lineHeight: 1.7 }}>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── BIG WIN BANNER ── */}
          {c.bigWin && (
            <div style={{
              background: green, borderRadius: 14, padding: '24px 28px', marginBottom: 32,
              display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', alignItems: 'center', gap: 20,
            }}>
              <div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>{c.bigWin.label}</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 28, color: 'rgba(255,255,255,0.65)', lineHeight: 1 }}>{c.bigWin.prevVal}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>{c.bigWin.prevSub}</div>
              </div>
              <div style={{ fontSize: 28, color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>→</div>
              <div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>This period</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 28, color: '#fff', lineHeight: 1 }}>{c.bigWin.currVal}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>{c.bigWin.currSub}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 52, color: '#fff', lineHeight: 1 }}>{c.bigWin.pctVal.toFixed(0)}%</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>{c.bigWin.pctLabel}</div>
              </div>
            </div>
          )}

          {/* ── THREE CHANNELS ── */}
          <div className="sc-3col">

            {/* Google Ads */}
            <div style={{ background: white, borderRadius: 14, border: `1px solid ${border}`, overflow: 'hidden' }}>
              <div style={{ padding: '20px 22px 16px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>Google Ads</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, color: green, background: 'rgba(45,90,61,0.07)', padding: '4px 10px', borderRadius: 6 }}>{fmtD(c.diningGoogleSpend)} CAD</span>
              </div>
              <div style={{ padding: '20px 22px' }}>
                {c.ga.reservations > 0 && (<>
                  <div style={{ fontSize: 11, color: dim, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, marginBottom: 8 }}>Reservations driven</div>
                  <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 34, color: green, lineHeight: 1 }}>{fmtN(c.ga.reservations)}</div>
                  <div style={{ fontSize: 14, color: muted, marginTop: 6, marginBottom: 18, lineHeight: 1.5 }}>{c.diningGoogleSpend > 0 ? `${fmtD(c.diningGoogleSpend)} dining spend · ${fmtD2(c.gCostPerRes)} / res` : ''}</div>
                </>)}
                {c.spendPerRes > 0 && (<>
                  <div style={{ fontSize: 11, color: dim, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, marginBottom: 8 }}>Avg spend per reservation</div>
                  <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 34, color: greenMid, lineHeight: 1 }}>{fmtD(c.spendPerRes)}</div>
                  <div style={{ fontSize: 14, color: muted, marginTop: 6, marginBottom: 18, lineHeight: 1.5 }}>Avg across {fmtN(c.res.ltpcCount)} reservations with POS data</div>
                </>)}
                {c.ga.reservations > 0 && c.spendPerRes > 0 && (<>
                  <div style={{ fontSize: 11, color: dim, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, marginBottom: 8 }}>Est. revenue driven</div>
                  <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 34, color: green, lineHeight: 1 }}>{fmtD(c.ga.reservations * c.spendPerRes)}</div>
                  <div style={{ fontSize: 14, color: muted, marginTop: 6, marginBottom: 18, lineHeight: 1.5 }}>{fmtN(c.ga.reservations)} res × {fmtD(c.spendPerRes)} avg</div>
                </>)}
                <hr style={{ border: 'none', borderTop: `1px solid ${border}`, margin: '14px 0' }} />
                {c.gResPct != null && statRow('vs prev period', `${c.gResPct >= 0 ? '+' : ''}${c.ga.reservations - c.gap.reservations} (${c.gResPct.toFixed(1)}%)`, c.gResPct >= 0 ? 'g' : 'r')}
                {c.gCostPerResP > 0 && statRow('Prev cost/res', fmtD2(c.gCostPerResP))}
                {c.ga.calls > 0 && statRow('Phone calls', `${fmtN(c.ga.calls)}${c.gap.calls > 0 ? ` (+${c.ga.calls - c.gap.calls})` : ''}`, c.ga.calls >= c.gap.calls ? 'g' : 'r')}
                {c.ga.storeVisits > 0 && statRow('Est. store visits', `~${fmtN(c.ga.storeVisits)}${c.gap.storeVisits > 0 ? ` (+${c.ga.storeVisits - c.gap.storeVisits})` : ''}`, c.ga.storeVisits >= c.gap.storeVisits ? 'g' : 'r')}
              </div>
              {c.gaCamps.filter(camp => camp.spend > 0 || camp.reservations > 0).length > 0 && (
                <ChExpand label="Campaign breakdown">
                  <MiniTable
                    headers={['Campaign', 'Res.', 'Spend']}
                    rows={c.gaCamps.filter(camp => camp.spend > 0 || camp.reservations > 0).map(camp => [
                      camp.name.replace('GG | ', ''),
                      fmtN(camp.reservations) || '0',
                      fmtD(camp.spend),
                    ])}
                    footerRow={['Total', fmtN(c.ga.reservations), fmtD(c.googleSpend)]}
                  />
                </ChExpand>
              )}
            </div>

            {/* Meta Ads */}
            <div style={{ background: white, borderRadius: 14, border: `1px solid ${border}`, overflow: 'hidden' }}>
              <div style={{ padding: '20px 22px 16px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>Meta Ads</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, color: green, background: 'rgba(45,90,61,0.07)', padding: '4px 10px', borderRadius: 6 }}>{fmtD(c.diningMetaSpend)} CAD</span>
              </div>
              <div style={{ padding: '20px 22px' }}>
                <div style={{ fontSize: 11, color: dim, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, marginBottom: 8 }}>Leads captured</div>
                <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 34, color: green, lineHeight: 1 }}>{fmtN(c.diningMetaResults)}</div>
                <div style={{ fontSize: 14, color: muted, marginTop: 6, marginBottom: 18, lineHeight: 1.5 }}>Across {c.fbCamps.filter(x => x.resultsCount > 0 && !x.name?.toLowerCase().includes('private event') && !x.name?.toLowerCase().includes('group booking')).length} dining campaigns</div>
                {c.fbl.matched > 0 && (<>
                  <div style={{ fontSize: 11, color: dim, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, marginBottom: 8 }}>Reservations from leads</div>
                  <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 34, color: greenMid, lineHeight: 1 }}>{fmtN(c.fbl.matched)}</div>
                  <div style={{ fontSize: 14, color: muted, marginTop: 6, marginBottom: 18, lineHeight: 1.5 }}>Cross-matched · {fmtN(c.fbl.newGuests)} new guests</div>
                </>)}
                {c.metaLeadRevenue > 0 && (<>
                  <div style={{ fontSize: 11, color: dim, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, marginBottom: 8 }}>Revenue from matched leads</div>
                  <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 34, color: green, lineHeight: 1 }}>{fmtD(c.metaLeadRevenue)}</div>
                  <div style={{ fontSize: 14, color: muted, marginTop: 6, marginBottom: 18, lineHeight: 1.5 }}>Total revenue from {fmtN(c.fbl.matched)} matched guests</div>
                </>)}
                <hr style={{ border: 'none', borderTop: `1px solid ${border}`, margin: '14px 0' }} />
                {c.fb.otReservations > 0 && statRow('OT reservations (pixel)', fmtN(c.fb.otReservations), 'g')}
                {c.fbl.newGuests > 0 && statRow('New guests', fmtN(c.fbl.newGuests), 'g')}
                {c.fbl.returning > 0 && statRow('Returning guests', fmtN(c.fbl.returning), 'a')}
                {c.unbooked > 0 && statRow('Unconverted (30–90d)', fmtN(c.unbooked))}
              </div>
              {(() => {
                const guestMap = {};
                (data.fbLeads?.daily || []).filter(d => d.date >= c.cs && d.date <= c.end).forEach(d => {
                  (d.matchedGuests || []).forEach(g => {
                    if (!guestMap[g.key]) guestMap[g.key] = { email: g.email, phone: g.phone, amount: 0, count: 0 };
                    guestMap[g.key].amount += g.amount;
                    guestMap[g.key].count++;
                  });
                });
                const rows = Object.values(guestMap).sort((a, b) => b.amount - a.amount);
                if (!rows.length) return null;
                return (
                  <ChExpand label="Matched guests breakdown">
                    <MiniTable
                      headers={['Guest', 'Res.', 'Revenue']}
                      rows={rows.map(g => [
                        g.email ? g.email.replace(/(.{2}).*(@.*)/, '$1***$2') : `***${g.phone.slice(-4)}`,
                        fmtN(g.count),
                        g.amount > 0 ? fmtD(g.amount) : '—',
                      ])}
                      footerRow={['Total', fmtN(rows.length), fmtD(rows.reduce((s, g) => s + g.amount, 0))]}
                    />
                  </ChExpand>
                );
              })()}
              {c.fbCamps.filter(x => x.spend > 0 && !x.name?.toLowerCase().includes('private event') && !x.name?.toLowerCase().includes('group booking')).length > 0 && (
                <ChExpand label="Campaign breakdown">
                  <MiniTable
                    headers={['Campaign', 'Leads', 'CPL']}
                    rows={c.fbCamps.filter(x => x.spend > 0 && !x.name?.toLowerCase().includes('private event') && !x.name?.toLowerCase().includes('group booking')).map(camp => [
                      camp.name.replace('[Lead] ', '').replace('[Awareness] ', ''),
                      camp.resultsCount > 0 ? fmtN(camp.resultsCount) : '—',
                      camp.resultsCount > 0 ? fmtD2(camp.leadSpend / camp.resultsCount) : '—',
                    ])}
                    footerRow={['Total', fmtN(c.diningMetaResults), '']}
                  />
                </ChExpand>
              )}
            </div>

            {/* Private Events */}
            <div style={{ background: white, borderRadius: 14, border: `1px solid ${border}`, overflow: 'hidden' }}>
              <div style={{ padding: '20px 22px 16px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>Private Events</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: muted, background: bg, padding: '4px 10px', borderRadius: 6, border: `1px solid ${border}` }}>Perfect Venue</span>
              </div>
              <div style={{ padding: '20px 22px' }}>
                <div style={{ fontSize: 11, color: dim, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, marginBottom: 8 }}>New inquiries</div>
                <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 34, color: green, lineHeight: 1 }}>{fmtN(c.pv.leads)}</div>
                <div style={{ fontSize: 14, color: muted, marginTop: 6, marginBottom: 18, lineHeight: 1.5 }}>
                  vs {fmtN(c.pvp.leads)} prev{c.pvLdPct != null ? ` · ${c.pvLdPct >= 0 ? '+' : ''}${c.pvLdPct.toFixed(1)}%` : ''}
                </div>
                {c.pv.revenueValue > 0 && (<>
                  <div style={{ fontSize: 11, color: dim, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, marginBottom: 8 }}>Sales from closed events</div>
                  <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 34, color: amber, lineHeight: 1 }}>{fmtD(c.pv.revenueValue)}</div>
                  <div style={{ fontSize: 14, color: muted, marginTop: 6, marginBottom: 18, lineHeight: 1.5 }}>{fmtN(c.pv.completed)} events · Total Paid / Balance Due / Budget</div>
                </>)}
                {c.pv.proposalTotal > 0 && c.pv.revenueValue === 0 && (<>
                  <div style={{ fontSize: 11, color: dim, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, marginBottom: 8 }}>Confirmed pipeline</div>
                  <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 34, color: amber, lineHeight: 1 }}>{fmtD(c.pv.proposalTotal)}+</div>
                  <div style={{ fontSize: 14, color: muted, marginTop: 6, marginBottom: 18, lineHeight: 1.5 }}>{fmtN(c.pv.completed)} events confirmed</div>
                </>)}
                <hr style={{ border: 'none', borderTop: `1px solid ${border}`, margin: '14px 0' }} />
                {c.pv.groupSize > 0 && statRow('Total group size', `${fmtN(c.pv.groupSize)}${c.pvp.groupSize > 0 ? ` (+${((c.pv.groupSize - c.pvp.groupSize) / c.pvp.groupSize * 100).toFixed(1)}%)` : ''}`, 'g')}
                {c.peTotalSpend > 0 && statRow('PE ad spend', `${fmtD(c.peTotalSpend)} (Meta ${fmtD(c.peMetaSpend)} · Google ${fmtD(c.peGoogleSpend)})`)}
                {c.peMetaLeads > 0 && statRow('PE leads', `${fmtN(c.peMetaLeads)} · ${fmtD2(c.peMetaCPL)} CPL`, 'g')}
                {c.peMetaLeads > 0 && statRow('Matched in Perfect Venue', `${fmtN(c.fbl.pePvMatched || 0)} of ${fmtN(c.peMetaLeads)} leads`, c.fbl.pePvMatched > 0 ? 'g' : '')}
                {c.fbl.pePvMatchedRevenue > 0 && statRow('Sales from matched leads', fmtD(c.fbl.pePvMatchedRevenue), 'g')}
                {c.pv.leads > 0 && statRow('Close rate', `${c.pvCloseRate.toFixed(1)}% (was ${c.pvCloseRateP.toFixed(1)}%)`, c.pvCloseRate >= c.pvCloseRateP ? 'g' : 'r')}
                {c.pv.lost > 0 && statRow('Lost', `${fmtN(c.pv.lost)} (was ${fmtN(c.pvp.lost)})`, c.pv.lost <= c.pvp.lost ? 'g' : 'r')}
                {(() => { const open = c.pv.leads - c.pv.completed - c.pv.lost; return open > 0 ? statRow('Open leads', `${open} awaiting proposals`, 'a') : null; })()}
                {c.pvp.revenueValue > 0 && statRow('Prev period sales', fmtD(c.pvp.revenueValue))}
                {c.pvp.proposalTotal > 0 && statRow('Prev period pipeline', fmtD(c.pvp.proposalTotal))}
              </div>
              {(() => {
                const open = c.pv.leads - c.pv.completed - c.pv.lost;
                return open > 0 ? (
                  <ChExpand label={`Open leads (${open})`}>
                    <div style={{ fontSize: 13, color: amber, marginBottom: 10, fontWeight: 500 }}>Follow up within 24–48 hours of inquiry</div>
                    <div style={{ fontSize: 13, color: muted }}>Check Perfect Venue for current open lead details.</div>
                  </ChExpand>
                ) : null;
              })()}
            </div>
          </div>

          {/* ── SEO ── */}
          {c.seo.clicks > 0 && (
            <div style={{ background: white, borderRadius: 14, border: `1px solid ${border}`, overflow: 'hidden', marginBottom: 24 }}>
              <div style={{ padding: '20px 22px 16px', borderBottom: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>Organic Search (SEO)</span>
                {c.seoClicksPct != null && (
                  <span style={{ fontSize: 13, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: c.seoClicksPct >= 0 ? 'rgba(45,122,79,0.08)' : 'rgba(184,66,51,0.08)', color: c.seoClicksPct >= 0 ? greenMid : red }}>
                    {c.seoClicksPct >= 0 ? '↑' : '↓'} {Math.abs(c.seoClicksPct).toFixed(0)}% clicks vs prev
                  </span>
                )}
              </div>
              <div style={{ padding: '20px 22px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
                <div>
                  <div style={{ fontSize: 11, color: dim, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, marginBottom: 8 }}>Organic clicks</div>
                  <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 34, color: green, lineHeight: 1 }}>{fmtN(c.seo.clicks)}</div>
                  {c.seop.clicks > 0 && <div style={{ fontSize: 14, color: muted, marginTop: 6, lineHeight: 1.5 }}>vs {fmtN(c.seop.clicks)} prev period</div>}
                </div>
                <div>
                  <div style={{ fontSize: 11, color: dim, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, marginBottom: 8 }}>Impressions</div>
                  <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 34, color: greenMid, lineHeight: 1 }}>{fmtN(c.seo.impressions)}</div>
                  {c.seop.impressions > 0 && <div style={{ fontSize: 14, color: muted, marginTop: 6, lineHeight: 1.5 }}>vs {fmtN(c.seop.impressions)} prev period</div>}
                </div>
              </div>
            </div>
          )}

          {/* ── WHAT'S NEXT ── */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 12, color: dim, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              What's next
              <div style={{ flex: 1, height: 1, background: border }} />
            </div>
            <div className="sc-actions">
              {c.actions.map((a, i) => (
                <div key={i} style={{ background: white, borderRadius: 12, padding: '20px 22px', border: `1px solid ${border}`, borderLeft: `3px solid ${green}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.9)', background: green, borderRadius: 4, padding: '2px 7px', lineHeight: 1.6, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#2A2A1E', letterSpacing: '-0.01em' }}>{a.title}</span>
                  </div>
                  <div style={{ fontSize: 13.5, color: muted, lineHeight: 1.65, paddingLeft: 2 }}>{a.body}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── MORE DETAIL ── */}
          <div style={{ fontSize: 12, color: dim, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            More detail
            <div style={{ flex: 1, height: 1, background: border }} />
          </div>

          <Expand label="Period-over-period comparison">
            <MiniTable
              headers={['Metric', fmtShortRange(c.ps, c.pe), fmtShortRange(c.cs, c.end), 'Change']}
              rows={[
                ['Google spend', fmtD(c.gap.spend), fmtD(c.googleSpend), `${pct(c.googleSpend, c.gap.spend)?.toFixed(1) ?? '—'}%`],
                ['Google reservations', fmtN(c.gap.reservations), fmtN(c.ga.reservations), `${c.gResPct != null ? (c.gResPct >= 0 ? '+' : '') + c.gResPct.toFixed(1) : '—'}%`],
                ['Google cost/res', c.gCostPerResP > 0 ? fmtD2(c.gCostPerResP) : '—', c.gCostPerRes > 0 ? fmtD2(c.gCostPerRes) : '—', c.gCPRPct != null ? `${c.gCPRPct.toFixed(1)}%` : '—'],
                ['Meta spend (dining)', fmtD(c.diningMetaSpendP), fmtD(c.diningMetaSpend), `${pct(c.diningMetaSpend, c.diningMetaSpendP)?.toFixed(1) ?? '—'}%`],
                ['Meta dining leads', fmtN(c.diningMetaResultsP), fmtN(c.diningMetaResults), `${pct(c.diningMetaResults, c.diningMetaResultsP) != null ? (pct(c.diningMetaResults, c.diningMetaResultsP) >= 0 ? '+' : '') + pct(c.diningMetaResults, c.diningMetaResultsP).toFixed(1) : '—'}%`],
                ['Meta dining CPL', c.diningMetaCPLP > 0 ? fmtD2(c.diningMetaCPLP) : '—', c.diningMetaCPL > 0 ? fmtD2(c.diningMetaCPL) : '—', c.diningMetaCPLPct != null ? `${c.diningMetaCPLPct.toFixed(1)}%` : '—'],
                ['Avg party size', c.avgPartySizeP > 0 ? c.avgPartySizeP.toFixed(2) : '—', c.avgPartySize > 0 ? c.avgPartySize.toFixed(2) : '—', ''],
              ]}
            />
          </Expand>

          <Expand label="Data gaps &amp; limitations">
            <div>
              {c.spendPerRes > 0 && (
                <span>Avg spend per reservation of {fmtD(c.spendPerRes)} is based on {fmtN(c.res.ltpcCount)} of {fmtN(c.res.reservations)} reservations with POS Paid data. Reservations without POS data are excluded from the average.<br /><br /></span>
              )}
              {c.unbooked > 0 && (
                <span>{fmtN(c.unbooked)} of {fmtN(c.metaResults)} Meta leads have no reservation on file yet. Window is 30–90 days.<br /><br /></span>
              )}
              Guest Lifetime Value, first-time guest attrition rate, and second-visit rate require 6+ months of cohort data.
            </div>
          </Expand>

        </>)}

        {/* Footer */}
        <div style={{ marginTop: 40, paddingTop: 18, borderTop: `1px solid ${border}`, display: 'flex', justifyContent: 'space-between', fontSize: 13, color: dim }}>
          <span>{restaurant?.name || slug} · Growth Scorecard · {periodLabel}</span>
          <span>Prepared by Guest Getter</span>
        </div>
      </div>
    </div>
  );
}
