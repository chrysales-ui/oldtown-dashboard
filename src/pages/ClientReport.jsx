import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useRestaurantData } from '../hooks/useRestaurantData';
import Nav from '../components/Nav';

// ── Design tokens (light theme — client-facing) ───────────────────────────────
const D = {
  bg:          '#FAFAF8',
  text:        '#1A1A1A',
  muted:       '#6B6B6B',
  accent:      '#2D5A3D',
  accentLight: '#E8F0EB',
  border:      '#E0DED8',
  positive:    '#2D7A4F',
  caution:     '#C4851C',
  cautionBg:   '#FDF6EC',
  negative:    '#B84233',
  altRow:      '#F5F5F3',
  white:       '#FFFFFF',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function addDays(d, n) {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
function sumW(arr, s, e, keys) {
  const a = Object.fromEntries(keys.map(k => [k, 0]));
  (arr || []).forEach(r => { if (r.date >= s && r.date <= e) keys.forEach(k => { a[k] += (r[k] || 0); }); });
  return a;
}
function pct(a, b) { return b > 0 ? ((a - b) / b * 100) : null; }
function fmtD(n, dec = 0) { return '$' + (+(n || 0)).toLocaleString('en-CA', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
function fmtN(n) { return (+(n || 0)).toLocaleString('en-CA', { maximumFractionDigits: 0 }); }
function fmtPct(p, dec = 1) {
  if (p == null) return null;
  return { text: `${p >= 0 ? '+' : ''}${p.toFixed(dec)}%`, up: p >= 0 };
}
function fmtDate(d) {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
function fmtRange(s, e) { return `${fmtDate(s)} – ${fmtDate(e)}`; }

// ── Compute all report metrics ────────────────────────────────────────────────
function compute(data, cs, end) {
  if (!data) return null;
  const span = Math.round((new Date(end) - new Date(cs)) / 86400000);
  const pe = addDays(cs, -1);
  const ps = addDays(pe, -span);

  const fb  = sumW(data.facebook?.daily,     cs, end, ['spend','leadSpend','resultsCount','reach','impressions','clicks']);
  const fbp = sumW(data.facebook?.daily,     ps, pe,  ['spend','leadSpend','resultsCount','reach','impressions','clicks']);
  const ga  = sumW(data.googleAds?.daily,    cs, end, ['spend','reservations','storeVisits','calls','clicks','impressions']);
  const gap = sumW(data.googleAds?.daily,    ps, pe,  ['spend','reservations','storeVisits','calls']);
  const res = sumW(data.reservations?.daily, cs, end, ['reservations','covers','seatedRes','ltpcSum','ltpcCount']);
  const resp= sumW(data.reservations?.daily, ps, pe,  ['reservations','covers','seatedRes','ltpcSum','ltpcCount']);
  const fv  = sumW(data.reservations?.firstVisitDaily, cs, end, ['firstVisit']);
  const fvp = sumW(data.reservations?.firstVisitDaily, ps, pe,  ['firstVisit']);
  const fl  = sumW(data.fbLeads?.daily, cs, end, ['leads', 'matched', 'newGuests', 'returning']);
  const flp = sumW(data.fbLeads?.daily, ps, pe,  ['leads', 'matched', 'newGuests', 'returning']);
  const pv  = sumW(data.perfectVenue?.daily, cs, end, ['leads','completed','groupSize']);
  const pvp = sumW(data.perfectVenue?.daily, ps, pe,  ['leads','completed','groupSize']);
  const tw  = sumW(data.toast?.daily,        cs, end, ['orders','total','size','transactions']);
  const twp = sumW(data.toast?.daily,        ps, pe,  ['orders','total','size','transactions']);

  const metaSpend  = fb.spend;
  const metaSpendP = fbp.spend;
  const metaLeads  = fb.resultsCount > 0 ? fb.resultsCount : fl.leads;
  const metaNewGuests = fl.newGuests;
  const metaReturning = fl.returning;
  const metaMatched   = fl.matched;
  const metaMatchRate = metaLeads > 0 ? +(metaMatched / metaLeads * 100).toFixed(1) : 0;
  const googleSpend = ga.spend;

  // Google Private (manually entered monthly spend — prorated to window)
  const gsp = (data.googlePrivate || []).reduce((s, r) => {
    const ms = r.month + '-01';
    const d2 = new Date(r.month + '-01'); d2.setMonth(d2.getMonth() + 1);
    const me = addDays(d2.toISOString().slice(0, 10), -1);
    if (ms <= end && me >= cs) {
      const td = (new Date(me) - new Date(ms)) / 86400000 + 1;
      const od = (Math.min(new Date(end), new Date(me)) - Math.max(new Date(cs), new Date(ms))) / 86400000 + 1;
      s += (r.spend || 0) * Math.min(1, Math.max(0, od / td));
    }
    return s;
  }, 0);
  const gspp = (data.googlePrivate || []).reduce((s, r) => {
    const ms = r.month + '-01';
    const d2 = new Date(r.month + '-01'); d2.setMonth(d2.getMonth() + 1);
    const me = addDays(d2.toISOString().slice(0, 10), -1);
    if (ms <= pe && me >= ps) {
      const td = (new Date(me) - new Date(ms)) / 86400000 + 1;
      const od = (Math.min(new Date(pe), new Date(me)) - Math.max(new Date(ps), new Date(ms))) / 86400000 + 1;
      s += (r.spend || 0) * Math.min(1, Math.max(0, od / td));
    }
    return s;
  }, 0);

  const googleTotal  = googleSpend + gsp;
  const googleTotalP = gap.spend + gspp;
  const totalSpend   = metaSpend + googleTotal;
  const totalSpendP  = metaSpendP + googleTotalP;

  const spendPerCover = res.ltpcCount > 0 ? res.ltpcSum / res.ltpcCount : 0;
  const gCostPerRes   = ga.reservations > 0 ? googleTotal / ga.reservations : 0;
  const metaCPL       = metaLeads > 0 ? metaSpend / metaLeads : 0;
  const trackedGuests = ga.reservations + (metaLeads > 0 ? metaLeads : fv.firstVisit);
  const blendedCPG    = trackedGuests > 0 ? totalSpend / trackedGuests : 0;
  const pvCloseRate   = pv.leads > 0 ? (pv.completed / pv.leads * 100) : 0;
  const pvCloseRateP  = pvp.leads > 0 ? (pvp.completed / pvp.leads * 100) : 0;
  const roas          = tw.total > 0 && totalSpend > 0 ? tw.total / totalSpend : null;

  const resPct   = pct(res.reservations, resp.reservations);
  const fvPct    = pct(fv.firstVisit, fvp.firstVisit);
  const spendPct = pct(totalSpend, totalSpendP);
  const gResPct  = pct(ga.reservations, gap.reservations);
  const pvLdPct  = pct(pv.leads, pvp.leads);
  const twPct    = pct(tw.total, twp.total);

  // ── Wins & watch ─────────────────────────────────────────────────────────────
  const wins = [], watch = [];
  if (resPct  != null && resPct  >= 5)  wins.push(`Reservations up ${resPct.toFixed(1)}% vs previous period — dining room demand is growing.`);
  if (fvPct   != null && fvPct   >= 5)  wins.push(`First-time guests up ${fvPct.toFixed(1)}% — ads are bringing in new faces.`);
  if (gResPct != null && gResPct >= 10) wins.push(`Google Ads drove ${fmtN(ga.reservations)} bookings — ${gResPct.toFixed(0)}% more than last period.`);
  if (tw.total > 0 && twPct != null && twPct >= 5) wins.push(`Toast revenue up ${twPct.toFixed(1)}% to ${fmtD(tw.total)}.`);
  if (roas  != null && roas   >= 15) wins.push(`Every $1 in ad spend returned ${roas.toFixed(1)}× in Toast revenue.`);
  if (metaCPL > 0 && metaCPL < 8)   wins.push(`Meta cost-per-lead at ${fmtD(metaCPL, 2)} — efficient lead generation.`);
  if (!wins.length) wins.push('Steady performance this period — holding the baseline.');

  if (resPct  != null && resPct  < -5)  watch.push(`Reservations down ${Math.abs(resPct).toFixed(1)}% — review Google Ads budget and targeting.`);
  if (fvPct   != null && fvPct   < -5)  watch.push(`Fewer first-time guests (${fvPct.toFixed(1)}%) — consider refreshing ad creatives.`);
  if (metaCPL > 15 && metaLeads > 0)    watch.push(`Meta cost-per-lead at ${fmtD(metaCPL, 2)} — test new creatives or audience.`);
  if (pvCloseRate < 15 && pv.leads > 3) watch.push(`Private event close rate at ${pvCloseRate.toFixed(1)}% — follow up with outstanding leads.`);
  if (!watch.length) watch.push('No significant concerns this period.');

  // ── Actions ───────────────────────────────────────────────────────────────────
  const actions = [];
  if (gResPct != null && gResPct >= 10)
    actions.push({ priority: 'high', text: `Google Ads is working — consider increasing PMax budget to capture more reservations.` });
  if (metaCPL > 12 && metaLeads > 0)
    actions.push({ priority: 'high', text: `Meta cost-per-lead at ${fmtD(metaCPL, 2)} — A/B test ad creatives or shift budget to Google.` });
  if (pvCloseRate < 15 && pv.leads > 3)
    actions.push({ priority: 'high', text: `Close rate at ${pvCloseRate.toFixed(1)}% — set up a 48-hour follow-up sequence for private event leads.` });
  if (fvPct != null && fvPct >= 10)
    actions.push({ priority: 'medium', text: `First-visit guests up ${fvPct.toFixed(0)}% — deploy a "second visit" email sequence to convert them to regulars.` });
  if (actions.length < 2)
    actions.push({ priority: 'medium', text: 'Review monthly SEO rankings and deploy next schema markup phase.' });
  if (actions.length < 3)
    actions.push({ priority: 'medium', text: 'Pull guest retention data — identify first-timers who have not returned within 60 days.' });

  // ── One-liner narrative ───────────────────────────────────────────────────────
  let narrative = `You spent ${fmtD(totalSpend)} across Google and Meta during this period.`;
  if (res.reservations > 0) {
    narrative += ` OpenTable recorded ${fmtN(res.reservations)} reservations (${fmtN(res.covers)} covers)${fv.firstVisit > 0 ? `, including ${fmtN(fv.firstVisit)} first-time guests` : ''}.`;
  }
  if (blendedCPG > 0 && spendPerCover > 0) {
    narrative += ` Each new guest cost about ${fmtD(blendedCPG, 2)} to reach — and your guests spend ${fmtD(spendPerCover, 0)} per cover.`;
  }

  return {
    cs, end, ps, pe,
    fb, fbp, ga, gap, res, resp, fv, fvp, pv, pvp, tw, twp,
    metaSpend, metaSpendP, metaLeads, metaNewGuests, metaReturning, metaMatched, metaMatchRate,
    fl, flp, trackedGuests,
    googleSpend, gsp, googleTotal, googleTotalP, totalSpend, totalSpendP,
    spendPerCover, gCostPerRes, metaCPL, blendedCPG, pvCloseRate, pvCloseRateP, roas,
    resPct, fvPct, spendPct, gResPct, pvLdPct, twPct,
    wins, watch, actions, narrative,
  };
}

// ── SVG Illustration ──────────────────────────────────────────────────────────
function InsightIllustration({ c }) {
  if (!c) return null;

  const hasCostSpend = c.spendPerCover > 0 && c.gCostPerRes > 0;
  const hasVolume    = c.ga.reservations > 0;

  if (hasCostSpend) {
    // The Scale — cost to acquire vs what they spend per reservation
    const costPerRes = c.gCostPerRes;
    const spendPerRes = c.spendPerCover;
    const ratio = spendPerRes > 0 && costPerRes > 0 ? (spendPerRes / costPerRes).toFixed(1) : null;
    return (
      <svg viewBox="0 0 500 160" width="500" height="160" style={{ display: 'block', maxWidth: '100%' }}>
        {/* Left box — cost */}
        <rect x="20" y="30" width="180" height="90" rx="8" fill={D.cautionBg} stroke={D.caution} strokeWidth="1.5" />
        <text x="110" y="58" textAnchor="middle" fontSize="11" fontFamily="Helvetica" fill={D.caution}>Cost per reservation</text>
        <text x="110" y="90" textAnchor="middle" fontSize="28" fontFamily="Helvetica" fontWeight="bold" fill={D.caution}>{fmtD(costPerRes, 2)}</text>
        <text x="110" y="112" textAnchor="middle" fontSize="9" fontFamily="Helvetica" fill={D.muted}>Google Ads ÷ bookings</text>

        {/* Arrow */}
        <text x="250" y="85" textAnchor="middle" fontSize="32" fontFamily="Helvetica" fill={D.accent}>→</text>

        {/* Right box — spend */}
        <rect x="300" y="30" width="180" height="90" rx="8" fill={D.accentLight} stroke={D.accent} strokeWidth="1.5" />
        <text x="390" y="58" textAnchor="middle" fontSize="11" fontFamily="Helvetica" fill={D.accent}>Guest spends per cover</text>
        <text x="390" y="90" textAnchor="middle" fontSize="28" fontFamily="Helvetica" fontWeight="bold" fill={D.accent}>{fmtD(spendPerRes, 0)}</text>
        <text x="390" y="112" textAnchor="middle" fontSize="9" fontFamily="Helvetica" fill={D.muted}>avg lifetime per-cover</text>

        {/* Ratio label */}
        {ratio && (
          <text x="250" y="148" textAnchor="middle" fontSize="11" fontFamily="Helvetica" fontWeight="bold" fill={D.positive}>
            {ratio}× return per visit
          </text>
        )}
      </svg>
    );
  }

  if (hasVolume) {
    // Simple bar showing reservations
    const curr = c.res.reservations;
    const prev = c.resp.reservations;
    const maxVal = Math.max(curr, prev, 1);
    const currH = Math.round((curr / maxVal) * 80);
    const prevH = Math.round((prev / maxVal) * 80);
    return (
      <svg viewBox="0 0 300 160" width="300" height="160" style={{ display: 'block', maxWidth: '100%' }}>
        <text x="150" y="20" textAnchor="middle" fontSize="11" fontFamily="Helvetica" fontWeight="bold" fill={D.text}>Reservations This Period vs Last</text>
        {/* Prev bar */}
        <rect x="70" y={110 - prevH} width="60" height={prevH} rx="4" fill={D.border} />
        <text x="100" y={108 - prevH} textAnchor="middle" fontSize="11" fontFamily="Helvetica" fill={D.muted}>{fmtN(prev)}</text>
        <text x="100" y="128" textAnchor="middle" fontSize="9" fontFamily="Helvetica" fill={D.muted}>Previous</text>
        {/* Curr bar */}
        <rect x="170" y={110 - currH} width="60" height={currH} rx="4" fill={D.accent} />
        <text x="200" y={108 - currH} textAnchor="middle" fontSize="11" fontFamily="Helvetica" fontWeight="bold" fill={D.accent}>{fmtN(curr)}</text>
        <text x="200" y="128" textAnchor="middle" fontSize="9" fontFamily="Helvetica" fill={D.text}>This Period</text>
        {/* Baseline */}
        <line x1="50" y1="110" x2="250" y2="110" stroke={D.border} strokeWidth="1" />
      </svg>
    );
  }

  return null;
}

// ── Print-only styles (injected as style tag) ─────────────────────────────────
const PRINT_CSS = `
@media print {
  .no-print { display: none !important; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: avoid; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
@page { size: letter; margin: 0.75in; }
`;

// ── Page shell ────────────────────────────────────────────────────────────────
function Page({ children, number }) {
  return (
    <div className="page" style={{
      background: D.bg,
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
      color: D.text,
      maxWidth: 720,
      margin: '0 auto 32px',
      padding: '40px 48px',
      border: `1px solid ${D.border}`,
      borderRadius: 8,
      position: 'relative',
    }}>
      {children}
      {number && (
        <div style={{ position: 'absolute', bottom: 20, right: 48, fontSize: 9, color: D.muted }}>
          {number}
        </div>
      )}
    </div>
  );
}

function PageHeader({ client, range }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, paddingBottom: 12, borderBottom: `1px solid ${D.border}` }}>
      <div>
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: D.accent }}>Guest Getter</span>
        <span style={{ fontSize: 9, color: D.muted, marginLeft: 8 }}>Growth Scorecard</span>
      </div>
      <div style={{ fontSize: 9, color: D.muted, textAlign: 'right' }}>
        <div style={{ fontWeight: 600, color: D.text }}>{client}</div>
        <div>{range}</div>
      </div>
    </div>
  );
}

function BigThreeCard({ label, value, context, highlight }) {
  return (
    <div style={{
      background: highlight ? D.accentLight : D.white,
      border: `1px solid ${highlight ? D.accent + '50' : D.border}`,
      borderRadius: 8, padding: '16px 18px', flex: 1,
    }}>
      <div style={{ fontSize: 9, color: D.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: highlight ? D.accent : D.text, letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 6 }}>{value}</div>
      <div style={{ fontSize: 9, color: D.muted, lineHeight: 1.4 }}>{context}</div>
    </div>
  );
}

function MetricPair({ costLabel, costValue, spendLabel, spendValue, annotation }) {
  return (
    <div style={{ border: `1px solid ${D.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr' }}>
        <div style={{ padding: '16px 18px', background: D.white }}>
          <div style={{ fontSize: 9, color: D.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{costLabel}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: D.negative, letterSpacing: '-0.02em' }}>{costValue}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', background: D.bg, color: D.accent, fontSize: 20, fontWeight: 300 }}>→</div>
        <div style={{ padding: '16px 18px', background: D.accentLight }}>
          <div style={{ fontSize: 9, color: D.accent, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{spendLabel}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: D.accent, letterSpacing: '-0.02em' }}>{spendValue}</div>
        </div>
      </div>
      {annotation && (
        <div style={{ padding: '8px 18px', borderTop: `1px dashed ${D.border}`, fontSize: 8, color: D.muted, lineHeight: 1.5 }}>
          {annotation}
        </div>
      )}
    </div>
  );
}

function DataRow({ label, value, color, last }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: last ? 'none' : `1px solid ${D.border}`, fontSize: 12 }}>
      <span style={{ color: D.muted }}>{label}</span>
      <span style={{ fontWeight: 700, color: color || D.text, fontFamily: 'monospace' }}>{value}</span>
    </div>
  );
}

function PctBadge({ p, isNegativeBad = true }) {
  const f = fmtPct(p);
  if (!f) return null;
  const good = isNegativeBad ? f.up : !f.up;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: good ? D.positive : D.negative, marginLeft: 8, padding: '2px 7px', background: good ? D.accentLight : '#FDECEA', borderRadius: 4 }}>
      {f.text}
    </span>
  );
}

function SectionTitle({ children, marginTop = 28 }) {
  return (
    <div style={{ fontSize: 14, fontWeight: 700, color: D.text, marginTop, marginBottom: 14, paddingBottom: 6, borderBottom: `2px solid ${D.accentLight}` }}>
      {children}
    </div>
  );
}

function TrackingGap({ children }) {
  return (
    <div style={{ borderLeft: `3px solid ${D.caution}`, background: D.cautionBg, borderRadius: '0 6px 6px 0', padding: '10px 14px', marginBottom: 12, fontSize: 11, color: D.text, lineHeight: 1.5 }}>
      ⚠ {children}
    </div>
  );
}

// ── Page 1: Headlines ─────────────────────────────────────────────────────────
function PageHeadlines({ c, restaurant, hasToast }) {
  if (!c) return null;
  const totalGuests = c.res.reservations;
  const costVsSpend = c.blendedCPG > 0 && c.spendPerCover > 0
    ? `${fmtD(c.blendedCPG, 2)} → ${fmtD(c.spendPerCover, 0)}`
    : c.gCostPerRes > 0 ? `${fmtD(c.gCostPerRes, 2)} per reservation` : '—';
  const ratioLine = c.spendPerCover > 0 && c.blendedCPG > 0
    ? `${(c.spendPerCover / c.blendedCPG).toFixed(1)}× return per visit`
    : c.roas ? `${c.roas.toFixed(1)}× Toast ROAS` : '';

  return (
    <Page number="1">
      {/* Cover header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.16em', color: D.accent, marginBottom: 4 }}>Growth Scorecard</div>
        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.04em', margin: '0 0 6px', color: D.text }}>{restaurant?.name}</h1>
        <div style={{ fontSize: 13, color: D.muted }}>{fmtRange(c.cs, c.end)}</div>
        <div style={{ fontSize: 11, color: D.muted, marginTop: 2 }}>
          Prepared by Guest Getter · {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </div>
      </div>

      {/* Big Three */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <BigThreeCard
          label="Total Spend"
          value={fmtD(c.totalSpend)}
          context={`Meta ${fmtD(c.metaSpend)} + Google ${fmtD(c.googleTotal)}${c.gsp > 0 ? ` (incl. ${fmtD(c.gsp)} private)` : ''}`}
        />
        <BigThreeCard
          label="Guests Reached"
          value={fmtN(c.trackedGuests)}
          context={`${fmtN(c.ga.reservations)} via Google · ${fmtN(c.metaLeads > 0 ? c.metaLeads : c.fv.firstVisit)} leads via Meta`}
        />
        <BigThreeCard
          label="Cost → Spend"
          value={costVsSpend}
          context={ratioLine}
          highlight
        />
      </div>

      {/* What happened */}
      <div style={{ background: D.accentLight, border: `1px solid ${D.accent}30`, borderRadius: 8, padding: '14px 18px', marginBottom: 24, fontSize: 13, color: D.text, lineHeight: 1.6 }}>
        <span style={{ fontWeight: 700, color: D.accent }}>What happened: </span>{c.narrative}
      </div>

      {/* Illustration */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
        <InsightIllustration c={c} hasToast={hasToast} />
      </div>
    </Page>
  );
}

// ── Page 2: Google Ads ────────────────────────────────────────────────────────
function PageGoogle({ c, restaurant }) {
  if (!c || c.googleTotal === 0) return null;
  return (
    <Page number="2">
      <PageHeader client={restaurant?.name} range={fmtRange(c.cs, c.end)} />

      <SectionTitle marginTop={0}>Google Ads Performance</SectionTitle>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Spend', value: fmtD(c.googleTotal), prev: c.gap.spend + (c.gspp || 0), negBad: false },
          { label: 'Reservations', value: fmtN(c.ga.reservations), prev: c.gap.reservations },
          { label: 'Cost / Reservation', value: c.gCostPerRes > 0 ? fmtD(c.gCostPerRes, 2) : '—', negBad: false },
        ].map((item, i) => (
          <div key={i} style={{ background: D.white, border: `1px solid ${D.border}`, borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontSize: 9, color: D.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{item.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: D.text, letterSpacing: '-0.02em' }}>{item.value}</span>
              {item.prev != null && <PctBadge p={pct(parseFloat(String(item.value).replace(/[^0-9.-]/g, '')), item.prev)} isNegativeBad={item.negBad !== false} />}
            </div>
          </div>
        ))}
      </div>

      {c.gCostPerRes > 0 && c.spendPerCover > 0 && (
        <MetricPair
          costLabel="What it cost per reservation"
          costValue={fmtD(c.gCostPerRes, 2)}
          spendLabel="What guests spend per cover"
          spendValue={fmtD(c.spendPerCover, 0)}
          annotation={`Source: Google Ads Manager · ${fmtRange(c.cs, c.end)}. Spend ${fmtD(c.googleTotal)} ÷ ${fmtN(c.ga.reservations)} OpenTable reservations = ${fmtD(c.gCostPerRes, 2)} per reservation. Guest spend: avg lifetime per-cover spend from OpenTable export.`}
        />
      )}

      {(c.ga.storeVisits > 0 || c.ga.calls > 0) && (
        <>
          <SectionTitle>Additional Signals</SectionTitle>
          <TrackingGap>
            Store visits and phone calls are Google estimates only — they are not included in the cost-per-reservation calculation above.
          </TrackingGap>
          <div style={{ background: D.white, border: `1px solid ${D.border}`, borderRadius: 8, padding: '4px 16px' }}>
            {c.ga.storeVisits > 0 && <DataRow label="Store Visits (Google estimate)" value={fmtN(c.ga.storeVisits)} />}
            {c.ga.calls > 0 && <DataRow label="Phone Calls" value={fmtN(c.ga.calls)} last={true} />}
          </div>
        </>
      )}

      <SectionTitle>The Math</SectionTitle>
      <div style={{ background: D.white, border: `1px solid ${D.border}`, borderRadius: 8, padding: '4px 16px' }}>
        <DataRow label="Google Ads Spend" value={fmtD(c.googleSpend)} />
        {c.gsp > 0 && <DataRow label="Google Private Spend" value={fmtD(c.gsp)} />}
        <DataRow label="Total Google Spend" value={fmtD(c.googleTotal)} color={D.accent} />
        <DataRow label="OpenTable Reservations" value={fmtN(c.ga.reservations)} />
        <DataRow label="Cost Per Reservation" value={c.gCostPerRes > 0 ? fmtD(c.gCostPerRes, 2) : '—'} />
        <DataRow label="Prev Period Spend" value={fmtD(c.gap.spend)} color={D.muted} />
        <DataRow label="Prev Period Reservations" value={fmtN(c.gap.reservations)} color={D.muted} last />
      </div>
      <div style={{ fontSize: 8, color: D.muted, marginTop: 8, lineHeight: 1.6 }}>
        Source: Google Ads Manager export · {fmtRange(c.cs, c.end)}.
        Reservations tracked via OpenTable conversion listener on Google Ads.
        Formula: Spend ÷ Reservations = Cost per reservation.
      </div>
    </Page>
  );
}

// ── Page 3: Meta Ads ──────────────────────────────────────────────────────────
function PageMeta({ c, restaurant }) {
  if (!c || c.metaSpend === 0) return null;
  return (
    <Page number="3">
      <PageHeader client={restaurant?.name} range={fmtRange(c.cs, c.end)} />

      <SectionTitle marginTop={0}>Meta Ads Performance</SectionTitle>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Spend', value: fmtD(c.metaSpend), prev: c.metaSpendP, negBad: false },
          { label: 'Leads (Form Fills)', value: fmtN(c.metaLeads), prev: c.fbp.resultsCount },
          { label: 'Cost / Lead', value: c.metaCPL > 0 ? fmtD(c.metaCPL, 2) : '—', negBad: false },
        ].map((item, i) => (
          <div key={i} style={{ background: D.white, border: `1px solid ${D.border}`, borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontSize: 9, color: D.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{item.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: D.text, letterSpacing: '-0.02em' }}>{item.value}</span>
              {item.prev != null && <PctBadge p={pct(parseFloat(String(item.value).replace(/[^0-9.-]/g, '')), item.prev)} isNegativeBad={item.negBad !== false} />}
            </div>
          </div>
        ))}
      </div>

      {c.metaLeads > 0 && (
        <>
          <SectionTitle>Lead → Guest Cross-Match</SectionTitle>
          <div style={{ background: D.white, border: `1px solid ${D.border}`, borderRadius: 8, padding: '4px 16px', marginBottom: 12 }}>
            <DataRow label="People who filled out the form" value={fmtN(c.metaLeads)} />
            <DataRow label="Matched to OpenTable (by email/phone)" value={fmtN(c.metaMatched)} />
            <DataRow label="→ New guests (first visit after form)" value={fmtN(c.metaNewGuests)} color={D.positive} />
            <DataRow label="→ Returning guests (already a guest)" value={fmtN(c.metaReturning)} color={D.caution} />
            <DataRow label="Match rate" value={c.metaMatchRate > 0 ? `${c.metaMatchRate}%` : '—'} last />
          </div>
          {c.metaNewGuests > 0 && (
            <MetricPair
              costLabel="Cost per new guest"
              costValue={fmtD(c.metaSpend / c.metaNewGuests, 2)}
              spendLabel="Guest spends per cover"
              spendValue={c.spendPerCover > 0 ? fmtD(c.spendPerCover, 0) : '—'}
              annotation={`${fmtN(c.metaLeads)} form fills → ${fmtN(c.metaMatched)} matched by email/phone → ${fmtN(c.metaNewGuests)} confirmed new guests. Cost: ${fmtD(c.metaSpend)} ÷ ${fmtN(c.metaNewGuests)} = ${fmtD(c.metaSpend / c.metaNewGuests, 2)} per new guest.`}
            />
          )}
          {c.metaReturning > 0 && (
            <div style={{ fontSize: 12, color: D.muted, marginTop: 8, lineHeight: 1.6, padding: '10px 14px', background: D.cautionBg, borderRadius: 8 }}>
              <strong style={{ color: D.caution }}>{fmtN(c.metaReturning)} returning guests</strong> — these people were already in your OpenTable database before the ad. The ad reminded them you exist. Counted separately from new guests.
            </div>
          )}
        </>
      )}

      {c.fb.reach > 0 && (
        <>
          <SectionTitle>Awareness & Reach</SectionTitle>
          <div style={{ background: D.white, border: `1px solid ${D.border}`, borderRadius: 8, padding: '4px 16px' }}>
            <DataRow label="Reach (unique accounts)" value={fmtN(c.fb.reach)} />
            <DataRow label="Impressions" value={fmtN(c.fb.impressions)} />
            <DataRow label="Clicks" value={fmtN(c.fb.clicks)} last />
          </div>
        </>
      )}

      <SectionTitle>The Math</SectionTitle>
      <div style={{ background: D.white, border: `1px solid ${D.border}`, borderRadius: 8, padding: '4px 16px' }}>
        <DataRow label="Total Meta Spend" value={fmtD(c.metaSpend)} />
        <DataRow label="Form Leads" value={fmtN(c.metaLeads)} />
        <DataRow label="Cost Per Lead" value={c.metaCPL > 0 ? fmtD(c.metaCPL, 2) : '—'} />
        <DataRow label="Matched to OpenTable" value={fmtN(c.metaMatched)} />
        <DataRow label="New Guests (confirmed)" value={fmtN(c.metaNewGuests)} color={D.positive} />
        <DataRow label="Returning Guests (reactivated)" value={fmtN(c.metaReturning)} color={D.caution} />
        <DataRow label="Prev Period Spend" value={fmtD(c.metaSpendP)} color={D.muted} last />
      </div>
      <div style={{ fontSize: 8, color: D.muted, marginTop: 8, lineHeight: 1.6 }}>
        Source: Meta Ads Manager export · {fmtRange(c.cs, c.end)}.
        Lead count from Facebook Leads sheet. Cross-matched against OpenTable by email and phone.
        New guest = first visit in OpenTable is after the lead form submission date.
      </div>
    </Page>
  );
}

// ── Page 4: Bigger Picture ────────────────────────────────────────────────────
function PageBiggerPicture({ c, restaurant, hasToast }) {
  if (!c) return null;
  const hasPrivate = c.pv.leads > 0;
  const hasToastData = hasToast && c.tw.total > 0;
  return (
    <Page number="4">
      <PageHeader client={restaurant?.name} range={fmtRange(c.cs, c.end)} />

      <SectionTitle marginTop={0}>The Bigger Picture</SectionTitle>
      <div style={{ fontSize: 10, color: D.muted, marginBottom: 16, marginTop: -8 }}>
        Everything above covered {fmtRange(c.cs, c.end)}. This section shows how that compares to the previous {Math.round((new Date(c.end) - new Date(c.cs)) / 86400000) + 1} days ({fmtRange(c.ps, c.pe)}).
      </div>

      {/* Period comparison table */}
      <div style={{ border: `1px solid ${D.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', background: D.accentLight }}>
          {['Metric', 'Current', 'Previous', 'Change'].map((h, i) => (
            <div key={i} style={{ padding: '8px 14px', fontSize: 9, fontWeight: 700, color: D.accent, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: i > 0 ? 'right' : 'left' }}>{h}</div>
          ))}
        </div>
        {[
          { label: 'Total Ad Spend', curr: fmtD(c.totalSpend), prev: fmtD(c.totalSpendP), chg: c.spendPct, negBad: false },
          { label: 'Reservations', curr: fmtN(c.res.reservations), prev: fmtN(c.resp.reservations), chg: c.resPct },
          { label: 'Covers', curr: fmtN(c.res.covers), prev: fmtN(c.resp.covers), chg: pct(c.res.covers, c.resp.covers) },
          { label: 'First-Time Guests', curr: fmtN(c.fv.firstVisit), prev: fmtN(c.fvp.firstVisit), chg: c.fvPct },
          { label: 'Google Reservations', curr: fmtN(c.ga.reservations), prev: fmtN(c.gap.reservations), chg: c.gResPct },
          ...(hasToastData ? [{ label: 'Toast Revenue', curr: fmtD(c.tw.total), prev: fmtD(c.twp.total), chg: c.twPct }] : []),
        ].map((row, i) => {
          const f = fmtPct(row.chg);
          const good = row.negBad !== false ? f?.up : !f?.up;
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', background: i % 2 === 0 ? D.white : D.altRow }}>
              <div style={{ padding: '8px 14px', fontSize: 11, color: D.text }}>{row.label}</div>
              <div style={{ padding: '8px 14px', fontSize: 11, fontWeight: 700, color: D.text, textAlign: 'right', fontFamily: 'monospace' }}>{row.curr}</div>
              <div style={{ padding: '8px 14px', fontSize: 11, color: D.muted, textAlign: 'right', fontFamily: 'monospace' }}>{row.prev}</div>
              <div style={{ padding: '8px 14px', fontSize: 11, fontWeight: 600, color: f ? (good ? D.positive : D.negative) : D.muted, textAlign: 'right' }}>
                {f ? f.text : '—'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Private Events */}
      {hasPrivate && (
        <>
          <SectionTitle>Private Events (Perfect Venue)</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
            {[
              { label: 'Leads', value: fmtN(c.pv.leads), prev: c.pvp.leads },
              { label: 'Confirmed', value: fmtN(c.pv.completed), prev: c.pvp.completed },
              { label: 'Close Rate', value: `${c.pvCloseRate.toFixed(1)}%`, rawCurr: c.pvCloseRate, rawPrev: c.pvCloseRateP },
              { label: 'Group Size', value: fmtN(c.pv.groupSize), prev: c.pvp.groupSize },
            ].map((item, i) => (
              <div key={i} style={{ background: D.white, border: `1px solid ${D.border}`, borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 9, color: D.muted, textTransform: 'uppercase', marginBottom: 4 }}>{item.label}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: D.text }}>{item.value}</span>
                  <PctBadge p={pct(item.rawCurr ?? parseFloat(String(item.value).replace(/[^0-9.-]/g, '')), item.rawPrev ?? item.prev)} />
                </div>
              </div>
            ))}
          </div>
          {c.pvCloseRate < 15 && c.pv.leads > 3 && (
            <TrackingGap>Close rate below 15% — follow up with outstanding leads within 48 hours.</TrackingGap>
          )}
        </>
      )}
    </Page>
  );
}

// ── Page 5: What's Next ───────────────────────────────────────────────────────
function PageWhatsNext({ c, restaurant }) {
  if (!c) return null;
  return (
    <Page number="5">
      <PageHeader client={restaurant?.name} range={fmtRange(c.cs, c.end)} />

      <SectionTitle marginTop={0}>What the Numbers Are Telling Us</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {c.wins.map((w, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, background: D.accentLight, border: `1px solid ${D.accent}25`, borderRadius: 8, padding: '10px 14px' }}>
            <span style={{ color: D.positive, fontSize: 13, flexShrink: 0 }}>✓</span>
            <span style={{ fontSize: 12, color: D.text, lineHeight: 1.5 }}>{w}</span>
          </div>
        ))}
        {c.watch.map((w, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, background: D.cautionBg, border: `1px solid ${D.caution}25`, borderRadius: 8, padding: '10px 14px' }}>
            <span style={{ color: D.caution, fontSize: 13, flexShrink: 0 }}>⚑</span>
            <span style={{ fontSize: 12, color: D.text, lineHeight: 1.5 }}>{w}</span>
          </div>
        ))}
      </div>

      <SectionTitle>What We're Doing About It</SectionTitle>
      <div style={{ background: D.white, border: `1px solid ${D.border}`, borderRadius: 8, padding: '4px 16px', marginBottom: 20 }}>
        {c.actions.map((a, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 0', borderBottom: i < c.actions.length - 1 ? `1px solid ${D.border}` : 'none' }}>
            <span style={{
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
              color: a.priority === 'high' ? D.negative : D.caution,
              background: a.priority === 'high' ? '#FDECEA' : D.cautionBg,
              padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap', marginTop: 2, flexShrink: 0,
            }}>
              {a.priority}
            </span>
            <span style={{ fontSize: 12, color: D.text, lineHeight: 1.6 }}>{a.text}</span>
          </div>
        ))}
      </div>

      <SectionTitle>What We Still Can't Measure</SectionTitle>
      <div style={{ background: D.white, border: `1px dashed ${D.border}`, borderRadius: 8, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          { metric: 'Guest Lifetime Value', why: 'How much is each guest worth over their entire relationship with you? (Need 12+ months of cohort data.)' },
          { metric: 'Second-Visit Rate', why: 'Of first-timers this period, how many return within 60 days? (Available next period.)' },
          { metric: 'Meta Lead-to-Guest Match', why: 'Exact match rate of form fills to OpenTable visits requires email/phone cross-matching.' },
        ].map((g, i) => (
          <div key={i} style={{ paddingBottom: i < 2 ? 10 : 0, borderBottom: i < 2 ? `1px solid ${D.border}` : 'none' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: D.caution }}>{g.metric}</div>
            <div style={{ fontSize: 11, color: D.muted, marginTop: 2, lineHeight: 1.5 }}>{g.why}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 32, paddingTop: 16, borderTop: `1px solid ${D.border}`, display: 'flex', justifyContent: 'space-between', fontSize: 9, color: D.muted }}>
        <span>Guest Getter · guestgetter.com</span>
        <span>Questions? Reply to this report or email your account manager.</span>
      </div>
    </Page>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────
export default function ClientReport({ restaurant }) {
  const { slug } = useParams();
  const { data, loading } = useRestaurantData(slug);

  const today = new Date().toISOString().slice(0, 10);
  const [endDate,   setEndDate]   = useState(addDays(today, -1));
  const [startDate, setStartDate] = useState(addDays(today, -14));

  const c = useMemo(() => {
    if (!data) return null;
    return compute(data, startDate, endDate);
  }, [data, startDate, endDate]);

  const hasToast = slug === 'carbon-snack';

  return (
    <div style={{ background: '#EDEDEB', minHeight: '100vh' }}>
      <style>{PRINT_CSS}</style>
      <Nav restaurantName={restaurant?.name} />

      {/* Controls */}
      <div className="no-print" style={{ background: '#1A1A1A', borderBottom: '1px solid #333', padding: '12px 32px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Client Report</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="date" value={startDate} max={endDate}
            onChange={e => setStartDate(e.target.value)}
            style={{ background: '#2a2a2a', border: '1px solid #333', color: '#ccc', borderRadius: 6, padding: '5px 8px', fontSize: 12, fontFamily: 'monospace', colorScheme: 'dark' }} />
          <span style={{ color: '#444', fontSize: 12 }}>→</span>
          <input type="date" value={endDate} min={startDate}
            onChange={e => setEndDate(e.target.value)}
            style={{ background: '#2a2a2a', border: '1px solid #333', color: '#ccc', borderRadius: 6, padding: '5px 8px', fontSize: 12, fontFamily: 'monospace', colorScheme: 'dark' }} />
        </div>
        {c && (
          <span style={{ fontSize: 11, color: '#555' }}>
            vs {fmtRange(c.ps, c.pe)}
          </span>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={() => window.print()}
            style={{ background: D.accent, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 12, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.03em' }}>
            Print / Save as PDF
          </button>
        </div>
      </div>

      {/* Report pages */}
      <div style={{ padding: '32px 24px 64px', maxWidth: 840, margin: '0 auto' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 80, color: '#888', fontSize: 14 }}>Loading report data…</div>
        )}
        {!loading && !c && (
          <div style={{ textAlign: 'center', padding: 80, color: '#888', fontSize: 14 }}>No data available for this date range. Try adjusting the dates.</div>
        )}
        {!loading && c && (
          <>
            <PageHeadlines c={c} restaurant={restaurant} hasToast={hasToast} />
            <PageGoogle c={c} restaurant={restaurant} />
            <PageMeta c={c} restaurant={restaurant} />
            <PageBiggerPicture c={c} restaurant={restaurant} hasToast={hasToast} />
            <PageWhatsNext c={c} restaurant={restaurant} />
          </>
        )}
      </div>
    </div>
  );
}
