import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import Nav from '../components/Nav';
import { useRestaurantData } from '../hooks/useRestaurantData';

// ── Helpers ───────────────────────────────────────────────────────────────

function addDays(d, n) {
  const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10);
}
function sumW(arr, s, e, keys) {
  const a = Object.fromEntries(keys.map(k => [k, 0]));
  (arr || []).forEach(r => { if (r.date >= s && r.date <= e) keys.forEach(k => { a[k] += (r[k] || 0); }); });
  return a;
}
function pct(a, b) { return b ? ((a - b) / b * 100).toFixed(1) : null; }
function fmt(n) { return (n ?? 0).toLocaleString('en-CA', { maximumFractionDigits: 0 }); }
function fmtK(n) { return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : fmt(n); }
function fmtD(n) { return '$' + fmt(n); }
function fmtTs(ts) {
  try { return new Date(ts).toLocaleString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }); }
  catch { return ts; }
}

function compute(data, end) {
  if (!data?.summary?.daily?.length) return null;
  const cs = addDays(end, -27), pe = addDays(cs, -1), ps = addDays(pe, -27);
  const su  = sumW(data.ga?.daily || data.summary.daily, cs, end, ['users', 'sessions']);
  const sup = sumW(data.ga?.daily || data.summary.daily, ps, pe,  ['users', 'sessions']);
  // Covers from Reservations tab (Column I = party size, seatedCovers = Done/Confirmed/Seated)
  const rc  = sumW(data.reservations?.daily, cs, end, ['seatedCovers', 'covers', 'ltpcSum', 'ltpcCount']);
  const rcp = sumW(data.reservations?.daily, ps, pe,  ['seatedCovers', 'covers', 'ltpcSum', 'ltpcCount']);
  const fb = sumW(data.facebook?.daily, cs, end, ['spend', 'profileVisits', 'clicks', 'resEvent', 'reach', 'impressions', 'resultsCount', 'thruPlays']);
  const fbp = sumW(data.facebook?.daily, ps, pe, ['spend', 'profileVisits', 'clicks', 'resEvent']);
  const ga = sumW(data.googleAds?.daily, cs, end, ['spend', 'reservations', 'calls', 'storeVisits', 'clicks', 'impressions']);
  const gap = sumW(data.googleAds?.daily, ps, pe, ['spend']);
  const gsp = (data.googlePrivate || []).reduce((s, r) => {
    const ms = r.month + '-01', d2 = new Date(r.month + '-01'); d2.setMonth(d2.getMonth() + 1);
    const me = addDays(d2.toISOString().slice(0, 10), -1);
    if (ms <= end && me >= cs) {
      const td = (new Date(me) - new Date(ms)) / 86400000 + 1;
      const od = (Math.min(new Date(end), new Date(me)) - Math.max(new Date(cs), new Date(ms))) / 86400000 + 1;
      s += (r.spend || 0) * Math.min(1, Math.max(0, od / td));
    }
    return s;
  }, 0);
  const gspp = (data.googlePrivate || []).reduce((s, r) => {
    const ms = r.month + '-01', d2 = new Date(r.month + '-01'); d2.setMonth(d2.getMonth() + 1);
    const me = addDays(d2.toISOString().slice(0, 10), -1);
    if (ms <= pe && me >= ps) {
      const td = (new Date(me) - new Date(ms)) / 86400000 + 1;
      const od = (Math.min(new Date(pe), new Date(me)) - Math.max(new Date(ps), new Date(ms))) / 86400000 + 1;
      s += (r.spend || 0) * Math.min(1, Math.max(0, od / td));
    }
    return s;
  }, 0);
  const googleTotal = ga.spend + gsp;
  const googleTotalPrev = gap.spend + gspp;
  const c  = { ...su,  covers: rc.seatedCovers,  allCovers: rc.covers,  spend: fb.spend + googleTotal };
  const p  = { ...sup, covers: rcp.seatedCovers, allCovers: rcp.covers, spend: fbp.spend + googleTotalPrev };
  const cpc = c.covers > 0 ? c.spend / c.covers : 0;
  const pcpc = p.covers > 0 ? p.spend / p.covers : 0;
  const avgGuestSpend = rc.ltpcCount > 0 ? rc.ltpcSum / rc.ltpcCount : 0;
  const avgGuestSpendPrev = rcp.ltpcCount > 0 ? rcp.ltpcSum / rcp.ltpcCount : 0;
  const conv = c.users > 0 ? (c.covers / c.users * 100) : 0;
  const visits = c.sessions > 0 ? c.sessions : Math.round(c.users * 1.29);
  const freq = fb.reach > 0 ? (fb.impressions / fb.reach).toFixed(2) : null;
  const fbCpc = fb.clicks > 0 ? (fb.spend / fb.clicks).toFixed(2) : null;
  const fbCpm = fb.impressions > 0 ? (fb.spend / fb.impressions * 1000).toFixed(2) : null;
  const fbCtr = fb.impressions > 0 ? (fb.clicks / fb.impressions * 100).toFixed(2) : null;
  const fbLinkClicks = fb.resultsCount || 0;
  const gCpc = ga.clicks > 0 ? (ga.spend / ga.clicks).toFixed(2) : null;
  const gCostPerRes = ga.reservations > 0 ? (googleTotal / ga.reservations).toFixed(2) : null;
  const endMonth = end.slice(0, 7);
  const emailMonth = (data.email?.monthly || []).find(m => m.month === endMonth) || (data.email?.monthly || []).at(-1);
  const campWindow = (data.googleAds?.campMonthly || []).filter(r => r.month >= cs.slice(0,7) && r.month <= end.slice(0,7));
  const searchRes = campWindow.filter(r => /search/i.test(r.name)).reduce((s, r) => s + (r.reservations || 0), 0);
  const pmaxRes   = campWindow.filter(r => /pmax|performance/i.test(r.name)).reduce((s, r) => s + (r.reservations || 0), 0);
  return {
    cs, end, c, p, fb, fbp, ga, gsp, googleTotal,
    cpc, pcpc, avgGuestSpend, avgGuestSpendPrev, conv, visits, freq, fbCpc, fbCpm, fbCtr, fbLinkClicks, gCpc, gCostPerRes,
    emailMonth, searchRes, pmaxRes,
    coversChg: pct(c.covers, p.covers),
    usersChg:  pct(c.users,  p.users),
    spendChg:  pct(c.spend,  p.spend),
    cpcChg:    pcpc > 0 ? pct(cpc, pcpc) : null,
    igChg:     pct(fb.profileVisits, fbp.profileVisits),
  };
}

// ── Layout helpers ────────────────────────────────────────────────────────

// Full-width section wrapper — background spans edge to edge, content is max-width
function Section({ bg, borderBottom = true, children }) {
  return (
    <div style={{ background: bg || 'transparent', borderBottom: borderBottom ? '1px solid #1f1f1f' : 'none' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 32px' }}>
        {children}
      </div>
    </div>
  );
}

function KpiCell({ label, value, prev, change, positive, border }) {
  return (
    <div style={{ padding: '32px 0', borderRight: border ? '1px solid #1f1f1f' : 'none', paddingRight: border ? 32 : 0, paddingLeft: 0 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#666', marginBottom: 12 }}>{label}</div>
      <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1, marginBottom: 8 }}>{value}</div>
      {prev  && <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{prev}</div>}
      {change && change !== '—' && (
        <div style={{ fontSize: 12, fontWeight: 600, color: positive ? '#22c55e' : '#f07070' }}>{change}</div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub }) {
  return (
    <div style={{ background: '#0d0d0d', border: '1px solid #1f1f1f', borderRadius: 8, padding: 20 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: '#666', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#555' }}>{sub}</div>
    </div>
  );
}

// ── Shared sub-components (also used by Ads.jsx) ─────────────────────────

const _card = { background: '#0d0d0d', border: '1px solid #1f1f1f', borderRadius: 8 };
const _eyebrow = { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: '#666', marginBottom: 6 };
const _muted = { fontSize: 12, color: '#666' };

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: '#666', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{value || '—'}</div>
    </div>
  );
}

function CorrelationItem({ label, value, sub }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 0', borderBottom: '1px solid #1a1a1a' }}>
      <span style={{ fontSize: 12, color: '#888' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600 }}>
        {value}
        {sub && <span style={{ fontSize: 10, color: '#555', marginLeft: 4 }}>{sub}</span>}
      </span>
    </div>
  );
}

function Badge({ status }) {
  const colors = {
    'ACTIVE':       { bg: 'rgba(34,197,94,0.1)',  color: '#22c55e' },
    'PLANNED':      { bg: 'rgba(99,102,241,0.1)', color: '#818cf8' },
    'NEEDS REVIEW': { bg: 'rgba(245,158,11,0.1)', color: '#fbbf24' },
  };
  const s = colors[status] || { bg: '#1a1a1a', color: '#666' };
  return (
    <span style={{ ...s, fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4 }}>
      {status}
    </span>
  );
}

function OptAccordion({ m, restaurant }) {
  const [open, setOpen] = useState(false);
  const ts = restaurant.trafficSources;
  const totalVisits = m?.visits ?? 0;
  const emailOpens     = m?.emailMonth?.opened    ?? 0;
  const emailClicks    = m?.emailMonth?.clicked   ?? 0;
  const emailOpenRate  = m?.emailMonth?.openRate;
  const emailClickRate = m?.emailMonth?.clickRate;

  return (
    <div style={{ borderBottom: '1px solid #1f1f1f' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 32px' }}>
        <button onClick={() => setOpen(o => !o)}
          style={{ width: '100%', background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: '20px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          Optimization Data
          <span style={{ fontSize: 16, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
        </button>

        {open && (
          <div style={{ paddingBottom: 32, display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>

            {/* Left: Funnel + Channel Split + Traffic */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Website Funnel */}
              <div style={_card}>
                <div style={{ padding: '20px 20px 0' }}>
                  <div style={_eyebrow}>Website Funnel</div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>Website visits → unique visitors → covers booked via website</h3>
                </div>
                <div style={{ padding: '0 20px 20px' }}>
                  {m && m.c.users > 0 ? (
                    <>
                      {[
                        { label: 'Website Visits',   val: m.visits,   color: '#4f8ef7' },
                        { label: 'Unique Visitors',  val: m.c.users,  color: '#4f8ef7bb' },
                        { label: 'Covers (Website)', val: m.c.covers, color: '#22c55e' },
                      ].map((row, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                          <div style={{ fontSize: 12, color: '#666', width: 120, textAlign: 'right', flexShrink: 0 }}>{row.label}</div>
                          <div style={{ flex: 1, background: '#111', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: row.color, width: `${(row.val / m.visits * 100).toFixed(1)}%`, borderRadius: 4 }} />
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, width: 56 }}>{row.val.toLocaleString('en-CA')}</div>
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 28, marginTop: 14, paddingTop: 14, borderTop: '1px solid #1f1f1f' }}>
                        <div><span style={{ fontSize: 20, fontWeight: 700, color: '#22c55e' }}>{m.conv.toFixed(1)}%</span><span style={{ fontSize: 12, color: '#666', marginLeft: 6 }}>website conversion</span></div>
                        <div><span style={{ fontSize: 20, fontWeight: 700 }}>${m.cpc.toFixed(2)}</span><span style={{ fontSize: 12, color: '#666', marginLeft: 6 }}>spend / cover</span></div>
                      </div>
                    </>
                  ) : <div style={{ color: '#444', fontSize: 13 }}>No data for this period</div>}
                </div>
              </div>

              {/* Channel Split */}
              <div style={_card}>
                <div style={{ padding: '20px 20px 0' }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Channel Split</h3>
                  <p style={{ ..._muted, marginBottom: 16 }}>Total ad spend: {m ? fmtD(m.c.spend) : '—'}</p>
                </div>
                <div style={{ padding: '0 20px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ background: '#111', border: '1px solid #1f1f1f', borderRadius: 8, padding: 16 }}>
                    <div style={_eyebrow}>Meta Ads · Instagram & Facebook</div>
                    <div style={{ fontSize: 24, fontWeight: 700, margin: '8px 0 14px' }}>{m ? fmtD(m.fb.spend) : '—'}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <Stat label="Reach"       value={m ? fmt(m.fb.reach) : null} />
                      <Stat label="Impressions" value={m ? fmt(m.fb.impressions) : null} />
                      <Stat label="Frequency"   value={m?.freq} />
                      <Stat label="Clicks (All)" value={m ? fmt(m.fb.clicks) : null} />
                      <Stat label="Link Clicks" value={m ? fmt(m.fbLinkClicks) : null} />
                      <Stat label="CTR"         value={m?.fbCtr ? `${m.fbCtr}%` : null} />
                      <Stat label="CPC (Link)"  value={m?.fbCpc ? `$${m.fbCpc}` : null} />
                    </div>
                  </div>
                  <div style={{ background: '#111', border: '1px solid #1f1f1f', borderRadius: 8, padding: 16 }}>
                    <div style={_eyebrow}>Google Ads · Search & PMax</div>
                    <div style={{ fontSize: 24, fontWeight: 700, margin: '8px 0 14px' }}>{m ? fmtD(m.googleTotal) : '—'}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <Stat label="OpenTable Reservations" value={m ? fmt(m.ga.reservations) : null} />
                      <Stat label="Phone Calls"    value={m ? fmt(m.ga.calls) : null} />
                      <Stat label="Store Visits"   value={m ? fmt(m.ga.storeVisits) : null} />
                      <Stat label="Cost / Reservation" value={m?.gCostPerRes ? `$${m.gCostPerRes}` : null} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Traffic Sources */}
              {ts && (
                <div style={_card}>
                  <div style={{ padding: '20px 20px 0' }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Website Traffic Sources</h3>
                    <p style={{ ..._muted, marginBottom: 16 }}>{totalVisits > 0 ? `${totalVisits.toLocaleString('en-CA')} total website visits` : 'Traffic breakdown'}</p>
                  </div>
                  <div style={{ padding: '0 20px 20px', display: 'grid', gridTemplateColumns: `repeat(${ts.length}, 1fr)`, gap: 12 }}>
                    {ts.map((src, i) => (
                      <div key={i} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{src.value.toLocaleString('en-CA')}</div>
                        <div style={{ fontSize: 13, color: '#888', marginBottom: 2 }}>{src.label}</div>
                        <div style={{ fontSize: 12, color: '#555' }}>{src.pct}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Correlation Grid + Next Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={_card}>
                <div style={{ padding: '20px 20px 0' }}>
                  <div style={_eyebrow}>The Correlation Grid</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
                    {['Discovery', '·', 'Intent', '·', 'Action'].map((t, i) => (
                      <span key={i} style={{ fontSize: 13, fontWeight: 600, color: t === '·' ? '#22c55e' : i === 0 ? '#fff' : i === 2 ? '#aaa' : '#666' }}>{t}</span>
                    ))}
                  </div>
                </div>
                <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#555', marginBottom: 4, letterSpacing: 1, textTransform: 'uppercase' }}>Meta / Instagram & Facebook</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e', marginBottom: 8 }}>Social Discovery</div>
                    <CorrelationItem label="IG Views"            value={m?.fb.thruPlays > 0 ? fmtK(m.fb.thruPlays) : '—'} />
                    <CorrelationItem label="Profile Visits"      value={m?.fb.profileVisits > 0 ? fmt(m.fb.profileVisits) : '—'} />
                    <CorrelationItem label="Link Clicks"         value={m ? fmt(m.fbLinkClicks) : '—'} />
                    <CorrelationItem label="Reservations (Meta)" value={m?.fb.resEvent > 0 ? fmt(m.fb.resEvent) : '—'} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#555', marginBottom: 4, letterSpacing: 1, textTransform: 'uppercase' }}>Google Ads & Email</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e', marginBottom: 8 }}>Search & Email Intent</div>
                    <CorrelationItem label="Search Reservations" value={m?.searchRes > 0 ? fmt(m.searchRes) : '—'} />
                    <CorrelationItem label="PMax Reservations"   value={m?.pmaxRes > 0 ? fmt(m.pmaxRes) : '—'} />
                    <CorrelationItem label="Phone Calls"         value={m ? fmt(m.ga.calls) : '—'} />
                    <CorrelationItem label="Email Opens"  value={emailOpens  > 0 ? fmt(emailOpens)  : '—'} sub={emailOpenRate  ? `${emailOpenRate}% rate`  : null} />
                    <CorrelationItem label="Email Clicks" value={emailClicks > 0 ? fmt(emailClicks) : '—'} sub={emailClickRate ? `${emailClickRate}% rate` : null} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#555', marginBottom: 4, letterSpacing: 1, textTransform: 'uppercase' }}>Bookings & Visits</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e', marginBottom: 8 }}>Conversions</div>
                    <CorrelationItem label="Store Visits"          value={m ? fmt(m.ga.storeVisits) : '—'} />
                    <CorrelationItem label="OpenTable Reservations" value={m ? fmt(m.ga.reservations) : '—'} />
                    <CorrelationItem label="Cost per Reservation"  value={m?.gCostPerRes ? `$${m.gCostPerRes}` : '—'} />
                  </div>
                </div>
              </div>

              {restaurant.nextActions?.length > 0 && (
                <div style={_card}>
                  <div style={{ padding: '16px 16px 0', fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Next Actions</div>
                  <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {restaurant.nextActions.map((action, i) => (
                      <div key={i} style={{ background: '#111', borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ marginBottom: 5 }}><Badge status={action.status} /></div>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{action.title}</div>
                        <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5 }}>{action.body}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Manual override inline editor ─────────────────────────────────────────

function ManualEdit({ label, value, onSave, onClear }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  function open() { setDraft(value != null ? String(value) : ''); setEditing(true); }
  function save() { const n = parseInt(draft.replace(/,/g, ''), 10); if (!isNaN(n)) onSave(n); setEditing(false); }

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  if (editing) return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        style={{ width: 90, background: '#111', border: '1px solid #444', color: '#fff', borderRadius: 4, padding: '2px 6px', fontSize: 12 }} />
      <button onClick={save} style={{ background: '#22c55e', border: 'none', color: '#000', borderRadius: 4, padding: '2px 7px', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>✓</button>
      <button onClick={() => setEditing(false)} style={{ background: 'none', border: '1px solid #333', color: '#666', borderRadius: 4, padding: '2px 6px', fontSize: 11, cursor: 'pointer' }}>✕</button>
    </span>
  );

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {label && <span style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}:</span>}
      <button onClick={open} title="Manually override" style={{ background: 'none', border: 'none', color: value != null ? '#22c55e' : '#444', cursor: 'pointer', fontSize: 11, padding: 0 }}>
        {value != null ? `${fmtK(value)} ✎` : '✎ edit'}
      </button>
      {value != null && <button onClick={onClear} title="Clear override" style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 10, padding: 0 }}>✕</button>}
    </span>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────

export default function Dashboard({ restaurant }) {
  const { slug } = useParams();
  const { data, loading, lastUpdated, refresh } = useRestaurantData(slug);

  const latest = useMemo(() => {
    const candidates = [
      data?.summary?.daily,
      data?.facebook?.daily,
      data?.googleAds?.daily,
      data?.reservations?.daily,
    ].flatMap(arr => arr?.length ? [arr[arr.length - 1].date] : []);
    return candidates.length ? candidates.sort().at(-1) : new Date().toISOString().slice(0, 10);
  }, [data]);

  const [end, setEnd] = useState('');
  const ed = end || latest;
  const m = useMemo(() => compute(data, ed), [data, ed]);

  // Manual override for web visitors — persisted per slug+endDate
  const overrideKey = `visitors_override_${slug}_${ed}`;
  const [visitorsOverride, setVisitorsOverride] = useState(() => {
    const v = localStorage.getItem(`visitors_override_${slug}_${ed}`);
    return v != null ? parseInt(v, 10) : null;
  });
  useEffect(() => {
    const v = localStorage.getItem(overrideKey);
    setVisitorsOverride(v != null ? parseInt(v, 10) : null);
  }, [overrideKey]);
  function saveVisitors(n) { localStorage.setItem(overrideKey, n); setVisitorsOverride(n); }
  function clearVisitors() { localStorage.removeItem(overrideKey); setVisitorsOverride(null); }

  // Previous period visitors override
  const prevOverrideKey = `visitors_override_${slug}_prev_${ed}`;
  const [prevVisitorsOverride, setPrevVisitorsOverride] = useState(() => {
    const v = localStorage.getItem(`visitors_override_${slug}_prev_${ed}`);
    return v != null ? parseInt(v, 10) : null;
  });
  useEffect(() => {
    const v = localStorage.getItem(prevOverrideKey);
    setPrevVisitorsOverride(v != null ? parseInt(v, 10) : null);
  }, [prevOverrideKey]);
  function savePrevVisitors(n) { localStorage.setItem(prevOverrideKey, n); setPrevVisitorsOverride(n); }
  function clearPrevVisitors() { localStorage.removeItem(prevOverrideKey); setPrevVisitorsOverride(null); }

  // IG Profile Visits overrides
  const igKey     = `ig_override_${slug}_${ed}`;
  const igPrevKey = `ig_override_${slug}_prev_${ed}`;
  const [igOverride,     setIgOverride]     = useState(() => { const v = localStorage.getItem(`ig_override_${slug}_${ed}`);      return v != null ? parseInt(v, 10) : null; });
  const [igPrevOverride, setIgPrevOverride] = useState(() => { const v = localStorage.getItem(`ig_override_${slug}_prev_${ed}`); return v != null ? parseInt(v, 10) : null; });
  useEffect(() => { const v = localStorage.getItem(igKey);     setIgOverride(v     != null ? parseInt(v, 10) : null); }, [igKey]);
  useEffect(() => { const v = localStorage.getItem(igPrevKey); setIgPrevOverride(v != null ? parseInt(v, 10) : null); }, [igPrevKey]);
  function saveIg(n)     { localStorage.setItem(igKey,     n); setIgOverride(n); }
  function clearIg()     { localStorage.removeItem(igKey);     setIgOverride(null); }
  function saveIgPrev(n) { localStorage.setItem(igPrevKey, n); setIgPrevOverride(n); }
  function clearIgPrev() { localStorage.removeItem(igPrevKey); setIgPrevOverride(null); }

  const displayIg     = igOverride     != null ? igOverride     : m?.fb.profileVisits  ?? 0;
  const displayIgPrev = igPrevOverride != null ? igPrevOverride : m?.fbp.profileVisits ?? 0;
  const displayIgChg  = displayIg > 0 && displayIgPrev > 0 ? pct(displayIg, displayIgPrev) : m?.igChg;

  const displayUsers     = visitorsOverride     != null ? visitorsOverride     : m?.c.users ?? 0;
  const displayPrevUsers = prevVisitorsOverride != null ? prevVisitorsOverride : m?.p.users ?? 0;
  const displayUsersChg  = displayUsers > 0 && displayPrevUsers > 0 ? pct(displayUsers, displayPrevUsers) : m?.usersChg;

  // Derived conv rates using displayUsers / displayPrevUsers
  const convRate     = m && displayUsers     > 0 ? (m.c.covers / displayUsers     * 100) : null;
  const convRatePrev = m && displayPrevUsers > 0 ? (m.p.covers / displayPrevUsers * 100) : null;
  const convRateChg  = convRate != null && convRatePrev != null ? pct(convRate, convRatePrev) : null;

  const monthLabel = useMemo(() => {
    const [y, mo] = ed.split('-');
    return new Date(+y, +mo - 1).toLocaleString('en-CA', { month: 'short', year: 'numeric' });
  }, [ed]);

  const updatedLabel = lastUpdated ? fmtTs(lastUpdated) : restaurant.lastUpdated;


  return (
    <div style={{ background: '#000', minHeight: '100vh', color: '#fff', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Nav restaurantName={restaurant.name} />

      {/* ── Hero ── */}
      <Section borderBottom>
        <div style={{ padding: '48px 0 40px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: '#22c55e', marginBottom: 16 }}>
            Performance Dashboard
          </div>
          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05, margin: '0 0 12px' }}>
            {restaurant.name}
          </h1>
          <p style={{ fontSize: '1rem', color: '#666', margin: '0 0 16px' }}>
            North Star Metrics · {monthLabel}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#444' }}>
              {loading ? 'Refreshing...' : `Last updated ${updatedLabel}`}
            </span>
            <button onClick={refresh} disabled={loading}
              style={{ background: 'none', border: '1px solid #333', borderRadius: 6, color: loading ? '#444' : '#666', cursor: loading ? 'default' : 'pointer', fontSize: 12, padding: '3px 10px' }}>
              {loading ? '...' : '↻ Refresh'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#555' }}>4W ending</span>
              <input type="date" value={ed} onChange={e => setEnd(e.target.value)}
                style={{ background: '#0d0d0d', border: '1px solid #222', color: '#fff', padding: '2px 8px', borderRadius: 5, fontSize: 11, colorScheme: 'dark' }} />
              {m && <span style={{ fontSize: 11, color: '#444' }}>({m.cs} → {ed})</span>}
            </div>
          </div>
        </div>
      </Section>

      {/* ── North Star ── */}
      <div style={{ background: '#040404', borderBottom: '1px solid #1f1f1f' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '64px 32px 48px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: '#22c55e', marginBottom: 16 }}>The North Star</div>
          <div style={{ fontSize: 'clamp(72px, 12vw, 120px)', fontWeight: 800, lineHeight: 1, letterSpacing: -2, marginBottom: 16 }}>
            {m?.avgGuestSpend > 0 ? `$${m.avgGuestSpend.toFixed(0)}` : '—'}
          </div>
          <div style={{ fontSize: 15, color: '#666', marginBottom: 8 }}>
            Avg spend per cover · current 4 weeks
          </div>
          {m?.avgGuestSpendPrev > 0 && m?.avgGuestSpend > 0 && (() => {
            const chg = ((m.avgGuestSpend - m.avgGuestSpendPrev) / m.avgGuestSpendPrev * 100);
            const up = chg >= 0;
            return (
              <div style={{ fontSize: 13, color: up ? '#22c55e' : '#f07070' }}>
                {up ? '↑' : '↓'} {Math.abs(chg).toFixed(1)}% vs prev 4W · prev: ${m.avgGuestSpendPrev.toFixed(0)}
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── 3-col KPI ── */}
      <Section borderBottom>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }}>
          {[
            { label: 'Covers',              val: m ? fmt(m.c.covers) : '—',                        prev: m ? `prev 4wk: ${fmt(m.p.covers)}` : null,          chg: m?.coversChg, pos: parseFloat(m?.coversChg) >= 0, note: m?.c.allCovers > 0 ? `${fmt(m.c.allCovers)} total booked · ${(m.c.covers / m.c.allCovers * 100).toFixed(1)}% confirmed` : null },
            { label: 'Unique Web Visitors', val: m ? fmtK(displayUsers) : '—', prev: m ? `prev 4wk: ${fmtK(displayPrevUsers)}` : null, chg: displayUsersChg, pos: parseFloat(displayUsersChg) >= 0,
              extra: m ? (
                <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <ManualEdit label="current" value={visitorsOverride} onSave={saveVisitors} onClear={clearVisitors} />
                  <ManualEdit label="prev 4wk" value={prevVisitorsOverride} onSave={savePrevVisitors} onClear={clearPrevVisitors} />
                </span>
              ) : null },
            { label: 'IG Profile Visits', val: displayIg > 0 ? fmt(displayIg) : '—', prev: displayIgPrev > 0 ? `prev 4wk: ${fmt(displayIgPrev)}` : null, chg: displayIgChg, pos: parseFloat(displayIgChg) >= 0,
              extra: m ? (
                <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <ManualEdit label="current"  value={igOverride}     onSave={saveIg}     onClear={clearIg} />
                  <ManualEdit label="prev 4wk" value={igPrevOverride} onSave={saveIgPrev} onClear={clearIgPrev} />
                </span>
              ) : null },
          ].map((k, i) => (
            <div key={i} style={{ padding: '32px 24px', borderRight: i < 2 ? '1px solid #1f1f1f' : 'none' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#666', marginBottom: 12 }}>{k.label}</div>
              <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1, marginBottom: 8 }}>{k.val}</div>
              {k.prev && <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{k.prev}</div>}
              {k.chg != null && k.chg !== '—' && (
                <div style={{ fontSize: 12, fontWeight: 600, color: k.pos ? '#22c55e' : '#f07070' }}>
                  {parseFloat(k.chg) >= 0 ? `↑ ${k.chg}%` : `↓ ${Math.abs(k.chg)}%`}
                </div>
              )}
              {k.note && <div style={{ fontSize: 11, color: '#444', marginTop: 4 }}>{k.note}</div>}
              {k.extra && <div style={{ marginTop: 6 }}>{k.extra}</div>}
            </div>
          ))}
        </div>
      </Section>

      {/* ── 2-col spend row ── */}
      <Section borderBottom>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <div style={{ padding: '28px 0', paddingRight: 32, borderRight: '1px solid #1f1f1f' }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#666', marginBottom: 8 }}>Total Mktg Spend</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>{m ? fmtD(m.c.spend) : '—'}</div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{m ? `${fmtD(m.fb.spend)} Meta · ${fmtD(m.googleTotal)} Google` : ''}</div>
            {m && <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>prev 4wk: {fmtD(m.p.spend)}</div>}
            {m?.spendChg != null && (
              <div style={{ fontSize: 12, fontWeight: 600, color: parseFloat(m.spendChg) <= 0 ? '#22c55e' : '#f07070' }}>
                {parseFloat(m.spendChg) >= 0 ? `↑ ${m.spendChg}%` : `↓ ${Math.abs(m.spendChg)}%`}
              </div>
            )}
          </div>
          <div style={{ padding: '28px 0', paddingLeft: 32 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#666', marginBottom: 8 }}>Covers Per Web Visitor</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>{convRate != null ? `${convRate.toFixed(1)}%` : '—'}</div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>{m ? `${fmt(m.c.covers)} covers ÷ ${fmt(displayUsers)} visitors` : ''}</div>
            {convRatePrev != null && <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>prev 4wk: {convRatePrev.toFixed(1)}%</div>}
            {convRateChg != null && (
              <div style={{ fontSize: 12, fontWeight: 600, color: parseFloat(convRateChg) >= 0 ? '#22c55e' : '#f07070' }}>
                {parseFloat(convRateChg) >= 0 ? `↑ ${convRateChg}%` : `↓ ${Math.abs(convRateChg)}%`}
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* ── 4-Week Summary ── */}
      <Section borderBottom>
        <div style={{ padding: '40px 0' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>4-Week Period Summary</h2>
            <span style={{ fontSize: 12, color: '#666' }}>{monthLabel}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <SummaryCard label="Avg Spend / Cover" value={m?.avgGuestSpend > 0 ? `$${m.avgGuestSpend.toFixed(0)}` : '—'} sub="lifetime per cover · all guests" />
            <SummaryCard label="Ad Spend Per Cover" value={m ? `$${m.cpc.toFixed(2)}` : '—'} sub={m ? `${fmtD(m.c.spend)} ÷ ${fmt(m.c.covers)} covers${m.pcpc > 0 ? ` · prev: $${m.pcpc.toFixed(2)}` : ''}` : ''} />
            <SummaryCard label="Covers"           value={m ? fmt(m.c.covers) : '—'}          sub={m ? `prev 4wk: ${fmt(m.p.covers)}${m.c.allCovers > 0 ? ` · ${(m.c.covers / m.c.allCovers * 100).toFixed(1)}% confirmed` : ''}` : ''} />
            <SummaryCard label="Covers Per Web Visitor" value={m && displayUsers > 0 ? `${(m.c.covers / displayUsers * 100).toFixed(1)}%` : '—'} sub={m ? `${fmt(m.c.covers)} ÷ ${fmtK(displayUsers)} visitors` : ''} />
            <SummaryCard label="IG Profile Visits" value={displayIg > 0 ? fmt(displayIg) : '—'} sub={displayIgPrev > 0 ? `prev 4wk: ${fmt(displayIgPrev)}` : ''} />
          </div>
        </div>
      </Section>

      {/* ── Optimization Data ── */}
      <OptAccordion m={m} restaurant={restaurant} />

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px', textAlign: 'center' }}>
        <p style={{ fontStyle: 'italic', color: '#444', fontSize: '0.85rem' }}>
          "Less is more. Nail the basics, then layer complexity."
        </p>
      </div>
    </div>
  );
}
