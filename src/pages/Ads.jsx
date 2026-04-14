import { useState, useMemo } from 'react';
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
function fmtD(n, dec = 0) { return '$' + (n ?? 0).toLocaleString('en-CA', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }

function compute(data, end) {
  if (!data?.summary?.daily?.length) return null;
  const daily = data.summary.daily;
  const cs = addDays(end, -27), pe = addDays(cs, -1), ps = addDays(pe, -27);
  const su  = sumW(data.ga?.daily || daily, cs, end, ['users', 'sessions']);
  const sup = sumW(data.ga?.daily || daily, ps, pe,  ['users', 'sessions']);
  const rc  = sumW(data.reservations?.daily, cs, end, ['seatedCovers', 'covers']);
  const rcp = sumW(data.reservations?.daily, ps, pe,  ['seatedCovers', 'covers']);
  const fb = sumW(data.facebook?.daily, cs, end, ['spend', 'reach', 'impressions', 'clicks', 'resEvent', 'resResults', 'profileVisits', 'thruPlays', 'resultsCount']);
  const ga = sumW(data.googleAds?.daily, cs, end, ['spend', 'reservations', 'calls', 'storeVisits', 'clicks', 'impressions']);

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

  const googleTotal = ga.spend + gsp;
  const c  = { ...su,  covers: rc.seatedCovers,  allCovers: rc.covers,  spend: fb.spend + googleTotal };
  const p  = { ...sup, covers: rcp.seatedCovers, allCovers: rcp.covers };

  // Frequency = impressions / reach
  const freq = fb.reach > 0 ? (fb.impressions / fb.reach).toFixed(2) : null;
  const fbCpc = fb.clicks > 0 ? (fb.spend / fb.clicks).toFixed(2) : null;
  const fbCtr = fb.impressions > 0 ? (fb.clicks / fb.impressions * 100).toFixed(2) : null;
  const fbLinkClicks = fb.resultsCount || 0;
  const gCostPerRes = ga.reservations > 0 ? (googleTotal / ga.reservations).toFixed(2) : null;
  const cpc = c.covers > 0 ? c.spend / c.covers : 0;
  const conv = c.users > 0 ? (c.covers / c.users * 100) : 0;
  const visits = c.sessions > 0 ? c.sessions : Math.round(c.users * 1.29);

  // Email for latest month in window
  const endMonth = end.slice(0, 7);
  const emailMonth = (data.email?.monthly || []).find(m => m.month === endMonth)
    || (data.email?.monthly || []).at(-1);

  // Google campaign breakdown: Search vs PMax
  const campWindow = (data.googleAds?.campMonthly || []).filter(r => r.month >= cs.slice(0,7) && r.month <= end.slice(0,7));
  const searchRes = campWindow.filter(r => /search/i.test(r.name)).reduce((s, r) => s + (r.reservations || 0), 0);
  const pmaxRes   = campWindow.filter(r => /pmax|performance/i.test(r.name)).reduce((s, r) => s + (r.reservations || 0), 0);

  return {
    cs, end, c, p, fb, ga, gsp, googleTotal,
    cpc, conv, visits, freq, fbCpc, fbCtr, fbLinkClicks,
    gCostPerRes, emailMonth, searchRes, pmaxRes,
    totalCostPerRes: (ga.reservations + (pmaxRes > 0 ? 0 : 0)) > 0
      ? (googleTotal / ga.reservations).toFixed(2) : null,
  };
}

// ── Mini components ──────────────────────────────────────────────────────

const card = { background: '#0d0d0d', border: '1px solid #1f1f1f', borderRadius: 8 };
const eyebrow = { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: '#666', marginBottom: 6 };
const muted = { fontSize: 12, color: '#666' };

function Stat({ label, value, sub }) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: '#666', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>
        {value || '—'}
        {sub && <span style={{ fontSize: 11, color: '#22c55e', marginLeft: 4 }}>{sub}</span>}
      </div>
    </div>
  );
}

function CorrelationItem({ label, value, sub, change }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 0', borderBottom: '1px solid #1a1a1a' }}>
      <span style={{ fontSize: 12, color: '#888' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600 }}>
        {value}
        {change && <span style={{ fontSize: 10, color: '#22c55e', marginLeft: 4 }}>{change}</span>}
        {sub && <span style={{ fontSize: 10, color: '#555', marginLeft: 4 }}>{sub}</span>}
      </span>
    </div>
  );
}

function Badge({ status }) {
  const colors = {
    'ACTIVE': { bg: 'rgba(34,197,94,0.1)', color: '#22c55e' },
    'PLANNED': { bg: 'rgba(99,102,241,0.1)', color: '#818cf8' },
    'NEEDS REVIEW': { bg: 'rgba(245,158,11,0.1)', color: '#fbbf24' },
  };
  const s = colors[status] || { bg: '#1a1a1a', color: '#666' };
  return (
    <span style={{ ...s, fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4 }}>
      {status}
    </span>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────

export default function Ads({ restaurant }) {
  const { slug } = useParams();
  const { data, loading, lastUpdated, refresh } = useRestaurantData(slug);

  const latest = useMemo(() => {
    if (!data?.summary?.daily?.length) return new Date().toISOString().slice(0, 10);
    return data.summary.daily[data.summary.daily.length - 1].date;
  }, [data]);

  const [end, setEnd] = useState('');
  const ed = end || latest;
  const m = useMemo(() => compute(data, ed), [data, ed]);

  // Traffic sources — from static restaurant data or compute proportionally from available data
  const ts = restaurant.trafficSources;
  const totalVisits = m?.visits ?? 0;

  // Correlation grid: email for window
  const emailOpens = m?.emailMonth?.opened ?? 0;
  const emailClicks = m?.emailMonth?.clicked ?? 0;
  const emailOpenRate = m?.emailMonth?.openRate;
  const emailClickRate = m?.emailMonth?.clickRate;

  return (
    <div style={{ background: '#000', minHeight: '100vh', color: '#fff', fontFamily: "'Inter',system-ui,sans-serif" }}>
      <Nav restaurantName={restaurant.name} />

      {/* ── Date bar ── */}
      <div style={{ background: '#000', borderBottom: '1px solid #1f1f1f', padding: '8px 32px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#555' }}>4W ending</span>
          <input type="date" value={ed} onChange={e => setEnd(e.target.value)}
            style={{ background: '#0d0d0d', border: '1px solid #222', color: '#fff', padding: '3px 8px', borderRadius: 5, fontSize: 11, colorScheme: 'dark' }} />
        </div>
        {m && <span style={{ fontSize: 11, color: '#444' }}>{m.cs} → {ed}</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: '#555' }}>{loading ? 'Refreshing...' : ''}</span>
          <button onClick={refresh} disabled={loading}
            style={{ background: 'none', border: '1px solid #333', borderRadius: 6, color: loading ? '#444' : '#666', cursor: loading ? 'default' : 'pointer', fontSize: 12, padding: '4px 10px' }}>
            {loading ? '...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      <main style={{ maxWidth: 1440, margin: '0 auto' }}>

        {/* ── Page header ── */}
        <div style={{ padding: '32px 32px 24px', borderBottom: '1px solid #1f1f1f' }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 4px' }}>Ad Performance</h1>
          <p style={muted}>Paid social & search campaign breakdown</p>
        </div>

        {/* ── 2-column layout ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, padding: '24px 32px', alignItems: 'start' }}>

          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Website Funnel */}
            <div style={card}>
              <div style={{ padding: '24px 24px 0' }}>
                <div style={eyebrow}>Website Funnel</div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 20px' }}>Website visits → unique visitors → covers booked via website</h2>
              </div>
              <div style={{ padding: '0 24px 24px' }}>
                {m && m.c.users > 0 ? (
                  <>
                    {[
                      { label: 'Website Visits',   val: m.visits,    color: '#4f8ef7' },
                      { label: 'Unique Visitors',  val: m.c.users,   color: '#4f8ef7bb' },
                      { label: 'Covers (Website)', val: m.c.covers,  color: '#22c55e' },
                    ].map((row, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
                        <div style={{ fontSize: 12, color: '#666', width: 130, textAlign: 'right', flexShrink: 0 }}>{row.label}</div>
                        <div style={{ flex: 1, background: '#111', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: row.color, width: `${(row.val / m.visits * 100).toFixed(1)}%`, borderRadius: 4 }} />
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, width: 60 }}>{row.val.toLocaleString('en-CA')}</div>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 32, marginTop: 16, paddingTop: 16, borderTop: '1px solid #1f1f1f' }}>
                      <div>
                        <span style={{ fontSize: 22, fontWeight: 700, color: '#22c55e' }}>{m.conv.toFixed(1)}%</span>
                        <span style={{ fontSize: 12, color: '#666', marginLeft: 6 }}>website conversion</span>
                      </div>
                      <div>
                        <span style={{ fontSize: 22, fontWeight: 700 }}>${m.cpc.toFixed(2)}</span>
                        <span style={{ fontSize: 12, color: '#666', marginLeft: 6 }}>spend / cover</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ color: '#444', fontSize: 13 }}>No data for this period</div>
                )}
              </div>
            </div>

            {/* Channel Split */}
            <div style={card}>
              <div style={{ padding: '24px 24px 0' }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Channel Split</h2>
                <p style={{ ...muted, marginBottom: 20 }}>
                  Total ad spend: {m ? fmtD(m.c.spend, 2) : '—'}
                </p>
              </div>
              <div style={{ padding: '0 24px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* Meta */}
                <div style={{ background: '#111', border: '1px solid #1f1f1f', borderRadius: 8, padding: 20 }}>
                  <div style={eyebrow}>Meta Ads · Instagram & Facebook</div>
                  <div style={{ fontSize: 28, fontWeight: 700, margin: '8px 0 16px' }}>{m ? fmtD(m.fb.spend, 2) : '—'}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Stat label="Reach" value={m ? fmt(m.fb.reach) : null} />
                    <Stat label="Impressions" value={m ? fmt(m.fb.impressions) : null} />
                    <Stat label="Frequency" value={m?.freq} />
                    <Stat label="Clicks (All)" value={m ? fmt(m.fb.clicks) : null} />
                    <Stat label="Link Clicks" value={m ? fmt(m.fbLinkClicks) : null} />
                    <Stat label="CTR" value={m?.fbCtr ? `${m.fbCtr}%` : null} />
                    <Stat label="CPC (Link)" value={m?.fbCpc ? `$${m.fbCpc}` : null} />
                  </div>
                </div>
                {/* Google */}
                <div style={{ background: '#111', border: '1px solid #1f1f1f', borderRadius: 8, padding: 20 }}>
                  <div style={eyebrow}>Google Ads · Search & PMax</div>
                  <div style={{ fontSize: 28, fontWeight: 700, margin: '8px 0 16px' }}>{m ? fmtD(m.googleTotal, 2) : '—'}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Stat label="OpenTable Reservations" value={m ? fmt(m.ga.reservations) : null} />
                    <Stat label="Phone Calls" value={m ? fmt(m.ga.calls) : null} />
                    <Stat label="Store Visits" value={m ? fmt(m.ga.storeVisits) : null} />
                    <Stat label="Cost / Reservation" value={m?.gCostPerRes ? `$${m.gCostPerRes}` : null} />
                  </div>
                </div>
              </div>
            </div>

            {/* Traffic Sources */}
            <div style={card}>
              <div style={{ padding: '24px 24px 0' }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Website Traffic Sources</h2>
                <p style={{ ...muted, marginBottom: 20 }}>{totalVisits > 0 ? `${totalVisits.toLocaleString('en-CA')} total website visits` : 'Traffic breakdown'}</p>
              </div>
              <div style={{ padding: '0 24px 24px' }}>
                {ts ? (
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ts.length}, 1fr)`, gap: 16 }}>
                    {ts.map((src, i) => (
                      <div key={i} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>{src.value.toLocaleString('en-CA')}</div>
                        <div style={{ fontSize: 13, color: '#888', marginBottom: 2 }}>{src.label}</div>
                        <div style={{ fontSize: 12, color: '#555' }}>{src.pct}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: '#444', fontSize: 13 }}>Traffic source data requires a GA sheet tab</div>
                )}
              </div>
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Correlation Grid */}
            <div style={card}>
              <div style={{ padding: '24px 24px 0' }}>
                <div style={eyebrow}>The Correlation Grid</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
                  {['Discovery', 'Intent', 'Action'].map((t, i) => (
                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {i > 0 && <span style={{ color: '#22c55e', fontSize: 14 }}>·</span>}
                      <span style={{ fontSize: 13, fontWeight: 600, color: i === 0 ? '#fff' : i === 1 ? '#aaa' : '#666' }}>{t}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Social Discovery */}
                <div>
                  <div style={{ fontSize: 10, color: '#555', marginBottom: 4, letterSpacing: 1, textTransform: 'uppercase' }}>Meta / Instagram & Facebook</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e', marginBottom: 8 }}>Social Discovery</div>
                  <CorrelationItem label="IG Views" value={m?.fb.thruPlays > 0 ? `${fmtK(m.fb.thruPlays)}` : '—'} />
                  <CorrelationItem label="Profile Visits" value={m?.fb.profileVisits > 0 ? fmt(m.fb.profileVisits) : '—'} />
                  <CorrelationItem label="Link Clicks" value={m ? fmt(m.fbLinkClicks) : '—'} />
                  <CorrelationItem label="Reservations (Meta)" value={m?.fb.resEvent > 0 ? fmt(m.fb.resEvent) : '—'} />
                </div>

                {/* Search & Email Intent */}
                <div>
                  <div style={{ fontSize: 10, color: '#555', marginBottom: 4, letterSpacing: 1, textTransform: 'uppercase' }}>Google Ads & Email</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e', marginBottom: 8 }}>Search & Email Intent</div>
                  <CorrelationItem label="Search Reservations" value={m?.searchRes > 0 ? fmt(m.searchRes) : '—'} />
                  <CorrelationItem label="PMax Reservations" value={m?.pmaxRes > 0 ? fmt(m.pmaxRes) : '—'} />
                  <CorrelationItem label="Phone Calls" value={m ? fmt(m.ga.calls) : '—'} />
                  <CorrelationItem label="Email Opens" value={emailOpens > 0 ? fmt(emailOpens) : '—'} sub={emailOpenRate ? `${emailOpenRate}% rate` : null} />
                  <CorrelationItem label="Email Clicks" value={emailClicks > 0 ? fmt(emailClicks) : '—'} sub={emailClickRate ? `${emailClickRate}% rate` : null} />
                </div>

                {/* Conversions */}
                <div>
                  <div style={{ fontSize: 10, color: '#555', marginBottom: 4, letterSpacing: 1, textTransform: 'uppercase' }}>Bookings & Visits</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e', marginBottom: 8 }}>Conversions</div>
                  <CorrelationItem label="Store Visits" value={m ? fmt(m.ga.storeVisits) : '—'} />
                  <CorrelationItem label="OpenTable Reservations" value={m ? fmt(m.ga.reservations) : '—'} />
                  <CorrelationItem label="Cost per Reservation" value={m?.gCostPerRes ? `$${m.gCostPerRes}` : '—'} />
                </div>
              </div>
            </div>

            {/* Next Actions */}
            {restaurant.nextActions?.length > 0 && (
              <div style={card}>
                <div style={{ padding: '20px 20px 0', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Next Actions</div>
                <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {restaurant.nextActions.map((action, i) => (
                    <div key={i} style={{ background: '#111', borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ marginBottom: 6 }}><Badge status={action.status} /></div>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{action.title}</div>
                      <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5 }}>{action.body}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
