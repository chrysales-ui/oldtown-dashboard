import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import Nav from '../components/Nav';
import { useRestaurantData } from '../hooks/useRestaurantData';

// ── Helpers ──────────────────────────────────────────────────────────────────
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
function pct(a, b) { return b ? ((a - b) / b * 100).toFixed(1) : null; }
function fmt(n) { return (n ?? 0).toLocaleString('en-CA', { maximumFractionDigits: 0 }); }
function fmtD(n, dec = 0) { return '$' + (n ?? 0).toLocaleString('en-CA', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtMonth(monthStr) {
  const [y, m] = monthStr.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, 1)
    .toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}
function fmtDateLong(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Compute ──────────────────────────────────────────────────────────────────
function compute(data, cs, end) {
  if (!data?.facebook?.daily?.length && !data?.googleAds?.daily?.length) return null;
  const span = Math.round((new Date(end) - new Date(cs)) / 86400000);
  const pe = addDays(cs, -1);
  const ps = addDays(pe, -span);

  const fb  = sumW(data.facebook?.daily, cs, end, ['spend', 'leadSpend', 'hhSpend', 'resultsCount', 'hhResultsCount', 'impressions', 'clicks', 'profileVisits', 'thruPlays', 'reach']);
  const fbp = sumW(data.facebook?.daily, ps, pe,  ['spend', 'leadSpend', 'hhSpend', 'resultsCount', 'hhResultsCount', 'impressions', 'clicks', 'profileVisits']);
  const ga  = sumW(data.googleAds?.daily, cs, end, ['spend', 'reservations', 'storeVisits', 'calls', 'clicks']);
  const gap = sumW(data.googleAds?.daily, ps, pe,  ['spend', 'reservations', 'storeVisits', 'calls']);

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

  const googleTotal     = ga.spend + gsp;
  const googleTotalPrev = gap.spend + gspp;

  // Daily chart data
  const fbDaily = (data.facebook?.daily || [])
    .filter(r => r.date >= cs && r.date <= end)
    .map(r => ({ label: fmtDate(r.date), spend: r.leadSpend ?? r.spend ?? 0, leads: r.resultsCount || 0 }));

  const gaDaily = (data.googleAds?.daily || [])
    .filter(r => r.date >= cs && r.date <= end)
    .map(r => ({ label: fmtDate(r.date), spend: r.spend || 0, reservations: r.reservations || 0 }));

  const endMonth = end.slice(0, 7);
  // Reservations monthly — from Oct of previous year, no future months
  const octStart = (parseInt(endMonth.slice(0, 4)) - 1) + '-10';
  const resChartData = (data.reservations?.monthly || [])
    .filter(r => r.month >= octStart && r.month <= endMonth)
    .map(r => ({ ...r, label: fmtMonth(r.month) }));

  // Perfect Venue
  const pv = data.perfectVenue || {};
  const pvMonthly = (pv.monthly || []).filter(r => r.month <= endMonth).slice(-12).map(r => ({ ...r, label: fmtMonth(r.month) }));
  const pvW  = sumW(pv.daily || [], cs, end,  ['leads', 'completed', 'lost', 'groupSize']);
  const pvWp = sumW(pv.daily || [], ps, pe,   ['leads', 'completed', 'lost', 'groupSize']);
  const pvCloseRate     = pvW.leads  > 0 ? (pvW.completed  / pvW.leads  * 100).toFixed(2) : '—';
  const pvCloseRatePrev = pvWp.leads > 0 ? (pvWp.completed / pvWp.leads * 100) : null;

  // Reservations window sums
  const res  = sumW(data.reservations?.daily, cs, end, ['reservations', 'covers', 'seatedCovers', 'seatedRes']);
  const resp = sumW(data.reservations?.daily, ps, pe,  ['reservations', 'covers', 'seatedCovers', 'seatedRes']);
  // First visit tracked separately by visit date
  const fv   = sumW(data.reservations?.firstVisitDaily, cs, end, ['firstVisit']);
  const fvp  = sumW(data.reservations?.firstVisitDaily, ps, pe,  ['firstVisit']);

  // Toast
  const toastMonthly = (data.toast?.monthly || [])
    .filter(r => r.month <= endMonth)
    .slice(-12)
    .map(r => ({ ...r, label: fmtMonth(r.month) }));
  const tw  = sumW(data.toast?.daily || [], cs, end, ['orders', 'total', 'size', 'transactions']);
  const twp = sumW(data.toast?.daily || [], ps, pe,  ['orders', 'total', 'size', 'transactions']);

  return {
    cs, end,
    fb, fbp, ga, gap,
    googleTotal, googleTotalPrev,
    fbCostPerResult:   fb.resultsCount > 0 ? (fb.leadSpend ?? fb.spend) / fb.resultsCount : 0,
    fbCostPerResultP:  fbp.resultsCount > 0 ? (fbp.leadSpend ?? fbp.spend) / fbp.resultsCount : 0,
    fbCostPerLpv:      fb.hhResultsCount > 0 ? fb.hhSpend / fb.hhResultsCount : 0,
    fbCostPerLpvP:     fbp.hhResultsCount > 0 ? fbp.hhSpend / fbp.hhResultsCount : 0,
    gCostPerRes:       ga.reservations > 0 ? googleTotal / ga.reservations : 0,
    gCostPerResPrev:   gap.reservations > 0 ? googleTotalPrev / gap.reservations : 0,
    gCostPerVisit:     ga.storeVisits > 0 ? googleTotal / ga.storeVisits : 0,
    gCostPerVisitPrev: gap.storeVisits > 0 ? googleTotalPrev / gap.storeVisits : 0,
    fbDaily, gaDaily, resChartData, pvMonthly, toastMonthly, tw, twp,
    res, resp, fv, fvp, pvW, pvWp,
    pvCloseRate, pvCloseRatePrev,
    pvTotalRevenue: pv.totalCompletedRevenue || 0,
  };
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const TOOLTIP_STYLE = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  color: '#1e3a5f',
  fontSize: '0.78rem',
  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
};

// ── Badge (% change) ──────────────────────────────────────────────────────────
function Badge({ value, prev, isNegativeBad = true }) {
  if (prev == null || prev === 0) return null;
  const val = parseFloat(value);
  const p = parseFloat(prev);
  if (isNaN(val) || isNaN(p) || p === 0) return null;
  const change = ((val - p) / Math.abs(p) * 100).toFixed(1);
  const up = parseFloat(change) > 0;
  const isGood = isNegativeBad ? up : !up;
  const color = isGood ? '#16a34a' : '#dc2626';
  return (
    <span style={{ fontSize: '0.72rem', fontWeight: 600, color, marginLeft: 6 }}>
      {up ? '↑' : '↓'}{Math.abs(change)}%
    </span>
  );
}

// ── KPI tile ─────────────────────────────────────────────────────────────────
function KpiTile({ label, value, prev, isNegativeBad = true, fullWidth = false, customize, hidden, onToggleHide, spendNote = false }) {
  const prevNum = typeof prev === 'number' ? prev : parseFloat(prev);
  const valNum = parseFloat(typeof value === 'string' ? value.replace(/[^0-9.-]/g, '') : value);
  const isDown = spendNote && !hidden && isNegativeBad && !isNaN(valNum) && !isNaN(prevNum) && prevNum > 0 && valNum < prevNum;
  if (!customize && hidden) return null;
  return (
    <div style={{
      background: hidden ? '#e8f0f8' : '#f0f5fb',
      borderRadius: 8,
      padding: '10px 14px',
      gridColumn: fullWidth ? '1 / -1' : undefined,
      position: 'relative',
      opacity: hidden ? 0.45 : 1,
      transition: 'opacity 0.15s',
    }}>
      <div style={{ fontSize: '0.67rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e3a5f', lineHeight: 1 }}>
        {hidden ? '—' : value}
        {!hidden && prev != null && <Badge value={value?.toString().replace(/[^0-9.-]/g, '')} prev={prevNum} isNegativeBad={isNegativeBad} />}
      </div>
      {isDown && <div style={{ fontSize: '0.6rem', color: '#dc2626', fontWeight: 600, marginTop: 4 }}>⚠ Spend is lower</div>}
      {customize && (
        <button onClick={() => onToggleHide(label)} style={{
          position: 'absolute', top: 6, right: 6,
          background: hidden ? '#3b82f6' : '#cbd5e1',
          border: 'none', borderRadius: 4, cursor: 'pointer',
          width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.6rem', color: '#fff', fontWeight: 700, padding: 0,
        }}>
          {hidden ? '↑' : '×'}
        </button>
      )}
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────
function Panel({ header, kpis, chartTitle, chart, footer }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid #e8f0f8',
        background: '#f8fbff',
      }}>
        {header}
      </div>

      {/* Body */}
      <div style={{ padding: '16px 18px', display: 'flex', gap: 16, flex: 1 }}>
        {/* KPIs */}
        <div style={{ flex: '0 0 38%', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {kpis}
        </div>
        {/* Chart */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {chartTitle && (
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {chartTitle}
            </div>
          )}
          {chart}
        </div>
      </div>

      {/* Footer */}
      {footer && (
        <div style={{ padding: '12px 18px', borderTop: '1px solid #e8f0f8', background: '#f8fbff' }}>
          {footer}
        </div>
      )}
    </div>
  );
}

// ── Logo components ───────────────────────────────────────────────────────────
function MetaHeader({ spend, spendPrev }) {
  const spendLower = spendPrev > 0 && spend < spendPrev;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 30, height: 30, borderRadius: 7, background: 'linear-gradient(135deg,#0062E0,#19AFFF)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#fff', fontWeight: 900, fontSize: '0.95rem' }}>f</span>
      </div>
      <div>
        <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1e3a5f' }}>Meta</div>
        <div style={{ fontSize: '0.6rem', color: '#1877F2', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Ads Manager</div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Spend</div>
        <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#1e3a5f' }}>
          {fmtD(spend)}
          <Badge value={spend} prev={spendPrev} isNegativeBad={false} />
        </div>
        {spendLower && <div style={{ fontSize: '0.6rem', color: '#dc2626', fontWeight: 600, marginTop: 2 }}>⚠ Spend lower than prev period</div>}
      </div>
    </div>
  );
}

function GoogleHeader({ spend, spendPrev }) {
  const spendLower = spendPrev > 0 && spend < spendPrev;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 30, height: 30, borderRadius: 7, background: '#fff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="18" height="18" viewBox="0 0 48 48">
          <path fill="#4285F4" d="M24 9.5C27.69 9.5 31 10.82 33.54 13.01L40.48 6.07C36.29 2.3 30.44 0 24 0 14.62 0 6.51 5.38 2.56 13.22L10.61 19.49C12.54 13.78 17.81 9.5 24 9.5Z"/>
          <path fill="#34A853" d="M46.98 24.55C46.98 22.78 46.83 21.06 46.54 19.39H24V29.16H36.93C36.35 32.27 34.54 34.89 31.88 36.63L39.7 42.77C44.27 38.57 46.98 32.07 46.98 24.55Z"/>
          <path fill="#FBBC05" d="M10.59 28.51C10.12 27.1 9.86 25.58 9.86 24C9.86 22.42 10.12 20.9 10.59 19.49L2.54 13.22C0.93 16.4 0 19.99 0 24C0 28.01 0.93 31.6 2.56 34.78L10.59 28.51Z"/>
          <path fill="#EA4335" d="M24 48C30.44 48 36.29 45.7 40.48 41.93L32.66 35.79C30.66 37.12 28.03 38 24 38C17.81 38 12.54 33.72 10.61 28.01L2.56 34.28C6.51 42.62 14.62 48 24 48Z"/>
        </svg>
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e3a5f' }}>Google Ads</div>
        <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Search & Performance Max</div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Spend</div>
        <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#1e3a5f' }}>
          {fmtD(spend)}
          <Badge value={spend} prev={spendPrev} isNegativeBad={false} />
        </div>
        {spendLower && <div style={{ fontSize: '0.6rem', color: '#dc2626', fontWeight: 600, marginTop: 2 }}>⚠ Spend lower than prev period</div>}
      </div>
    </div>
  );
}

function OpenTableHeader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#DA3743', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#fff' }} />
      </div>
      <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e3a5f' }}>OpenTable</div>
      <div style={{ fontSize: '0.62rem', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Reservations</div>
    </div>
  );
}

function ToastHeader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 30, height: 30, borderRadius: 7, background: '#fff3ee', border: '1px solid #fbd5c5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#e85c2c', fontWeight: 900, fontSize: '0.72rem' }}>T</span>
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e3a5f' }}>Toast</div>
        <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>POS</div>
      </div>
    </div>
  );
}

function PerfectVenueHeader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 30, height: 30, borderRadius: 7, background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#7c3aed', fontWeight: 900, fontSize: '0.75rem' }}>PV</span>
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e3a5f' }}>perfect venue</div>
        <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Private Events</div>
      </div>
    </div>
  );
}

// ── Charts ────────────────────────────────────────────────────────────────────
function DailyChart({ data, barKey, barLabel, lineKey, lineLabel }) {
  return (
    <ResponsiveContainer width="100%" height={170}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
        <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} interval={3} />
        <YAxis yAxisId="left" tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} width={28} />
        <YAxis yAxisId="right" orientation="right" tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} width={38}
          tickFormatter={v => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
        <Tooltip contentStyle={TOOLTIP_STYLE}
          formatter={(value, name) => name === barLabel ? [`$${fmt(value)}`, name] : [fmt(value), name]} />
        <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: '0.7rem', paddingTop: 4 }} />
        <Bar yAxisId="right" dataKey={barKey} name={barLabel} fill="#fca5a5" opacity={0.85} radius={[2, 2, 0, 0]} />
        <Line yAxisId="left" type="monotone" dataKey={lineKey} name={lineLabel} stroke="#e53935" strokeWidth={2} dot={{ r: 2, fill: '#e53935' }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function ReservationsMonthlyChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={170}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
        <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} interval={1} />
        <YAxis yAxisId="left" tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} width={38} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: '0.7rem', paddingTop: 4 }} />
        <Line yAxisId="left" type="monotone" dataKey="reservations" name="Reservations" stroke="#e53935" strokeWidth={2} dot={{ r: 2.5, fill: '#e53935' }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function ToastMonthlyChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={170}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
        <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} interval={1} />
        <YAxis yAxisId="left" tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} width={28} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: '0.7rem', paddingTop: 4 }} />
        <Line yAxisId="left" type="monotone" dataKey="orders" name="Order #" stroke="#e85c2c" strokeWidth={2} dot={{ r: 2.5, fill: '#e85c2c' }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function PvMonthlyChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={170}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
        <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} interval={1} />
        <YAxis yAxisId="left" tick={{ fill: '#94a3b8', fontSize: 9 }} axisLine={false} tickLine={false} width={28} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: '0.7rem', paddingTop: 4 }} />
        <Line yAxisId="left" type="monotone" dataKey="leads" name="Leads" stroke="#e53935" strokeWidth={2} dot={{ r: 2.5, fill: '#e53935' }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Analytics({ restaurant }) {
  const { slug } = useParams();
  const { data, loading, error, lastUpdated } = useRestaurantData(slug);

  const today = new Date().toISOString().slice(0, 10);
  const [endDate, setEndDate] = useState(today);
  const [startDate, setStartDate] = useState(addDays(today, -27));
  const [customize, setCustomize] = useState(false);
  const storageKey = `hidden-metrics-${slug}`;
  const [hiddenMetrics, setHiddenMetrics] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(storageKey) || '[]')); } catch { return new Set(); }
  });
  const toggleHide = (label) => {
    setHiddenMetrics(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      localStorage.setItem(storageKey, JSON.stringify([...next]));
      return next;
    });
  };
  const [firstVisitOverride, setFirstVisitOverride] = useState('');
  const [firstVisitPrevOverride, setFirstVisitPrevOverride] = useState('');
  const [fbSpendOverride, setFbSpendOverride] = useState('');
  const [fbSpendPrevOverride, setFbSpendPrevOverride] = useState('');
  const [fbReachOverride, setFbReachOverride] = useState('');
  const [fbReachPrevOverride, setFbReachPrevOverride] = useState('');

  const c = useMemo(() => {
    if (!data) return null;
    return compute(data, startDate, endDate);
  }, [data, startDate, endDate]);

  const n = (v) => (v == null || v === 0 ? '—' : fmt(v));
  const kp = (label) => ({ customize, hidden: hiddenMetrics.has(label), onToggleHide: toggleHide });

  return (
    <div style={{ background: '#dce8f2', minHeight: '100vh' }}>
      <Nav restaurantName={restaurant?.name} />

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 28px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: '#1e3a5f', letterSpacing: '-0.02em' }}>Analytics</h1>
            <p style={{ margin: '3px 0 0', color: '#64748b', fontSize: '0.8rem' }}>Select a date range to analyze all channels</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setCustomize(v => !v)} style={{
            background: customize ? '#1e3a5f' : '#fff',
            color: customize ? '#fff' : '#1e3a5f',
            border: '1.5px solid #1e3a5f',
            borderRadius: 8, padding: '6px 14px',
            fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
          }}>
            {customize ? 'Done' : 'Customize'}
          </button>

          {/* Date range picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1e3a5f', borderRadius: 8, padding: '7px 14px' }}>
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={e => setStartDate(e.target.value)}
              style={{
                background: 'transparent', border: 'none', outline: 'none',
                color: '#fff', fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer',
              }}
            />
            <span style={{ color: '#93c5fd', fontSize: '0.8rem' }}>→</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={e => setEndDate(e.target.value)}
              style={{
                background: 'transparent', border: 'none', outline: 'none',
                color: '#fff', fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer',
              }}
            />
          </div>
          </div>
        </div>

        {loading && <div style={{ color: '#64748b', textAlign: 'center', padding: '80px 0' }}>Loading data…</div>}
        {error   && <div style={{ color: '#dc2626', textAlign: 'center', padding: '80px 0' }}>Error: {error}</div>}

        {!loading && c && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            {/* ── Meta ── */}
            <Panel
              header={<MetaHeader spend={c.fb.spend} spendPrev={c.fbp.spend} />}
              kpis={
                slug === 'carbon-snack' ? (
                  <>
                    {/* Editable Spend */}
                    <div style={{ background: '#f0f5fb', borderRadius: 8, padding: '10px 14px' }}>
                      <div style={{ fontSize: '0.67rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Cost / Reach</div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e3a5f' }}>$</span>
                        <input
                          type="number"
                          value={fbSpendOverride}
                          onChange={e => setFbSpendOverride(e.target.value)}
                          placeholder="0.00"
                          style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '1.1rem', fontWeight: 700, color: '#1e3a5f', width: '90px', padding: 0 }}
                        />
                        <Badge
                          value={fbSpendOverride !== '' ? fbSpendOverride : null}
                          prev={fbSpendPrevOverride !== '' ? parseFloat(fbSpendPrevOverride) : null}
                          isNegativeBad={false}
                        />
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>prev: $</span>
                        <input
                          type="number"
                          value={fbSpendPrevOverride}
                          onChange={e => setFbSpendPrevOverride(e.target.value)}
                          placeholder="0.00"
                          style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', width: '70px', padding: 0 }}
                        />
                      </div>
                    </div>
                    {/* Editable Reach */}
                    <div style={{ background: '#f0f5fb', borderRadius: 8, padding: '10px 14px' }}>
                      <div style={{ fontSize: '0.67rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Reach</div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <input
                          type="number"
                          value={fbReachOverride !== '' ? fbReachOverride : (c.fb.reach || '')}
                          onChange={e => setFbReachOverride(e.target.value)}
                          placeholder={fmt(c.fb.reach)}
                          style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '1.1rem', fontWeight: 700, color: '#1e3a5f', width: '90px', padding: 0 }}
                        />
                        <Badge
                          value={fbReachOverride !== '' ? fbReachOverride : c.fb.reach}
                          prev={fbReachPrevOverride !== '' ? parseFloat(fbReachPrevOverride) : c.fbp.reach}
                        />
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>prev: </span>
                        <input
                          type="number"
                          value={fbReachPrevOverride !== '' ? fbReachPrevOverride : (c.fbp.reach || '')}
                          onChange={e => setFbReachPrevOverride(e.target.value)}
                          placeholder={fmt(c.fbp.reach)}
                          style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', width: '70px', padding: 0 }}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <KpiTile label="Results (Meta Leads)" {...kp("Results (Meta Leads)")} value={n(c.fb.resultsCount)} prev={c.fbp.resultsCount} spendNote />
                    <KpiTile label="Cost / Result (Meta Leads)" {...kp("Cost / Result (Meta Leads)")} value={c.fbCostPerResult ? fmtD(c.fbCostPerResult, 2) : '—'} prev={c.fbCostPerResultP} isNegativeBad={false} />
                    <KpiTile label="Results (L. Page Views)" {...kp("Results (L. Page Views)")} value={n(c.fb.hhResultsCount)} prev={c.fbp.hhResultsCount} spendNote />
                    <KpiTile label="Cost / Result (L. Page Views)" {...kp("Cost / Result (L. Page Views)")} value={c.fbCostPerLpv ? fmtD(c.fbCostPerLpv, 2) : '—'} prev={c.fbCostPerLpvP} isNegativeBad={false} />
                  </>
                )
              }
              chartTitle={slug === 'carbon-snack' ? 'Reach by Date' : 'Meta Leads by Date'}
              chart={<DailyChart data={c.fbDaily} barKey="spend" barLabel="Spend" lineKey="leads" lineLabel={slug === 'carbon-snack' ? 'Reach' : 'Meta Leads'} />}
            />

            {/* ── Google Ads ── */}
            <Panel
              header={<GoogleHeader spend={c.googleTotal} spendPrev={c.googleTotalPrev} />}
              kpis={
                <>
                  <KpiTile label={slug === 'carbon-snack' ? 'Order + Delivery Button' : 'Reservations'} {...kp(slug === 'carbon-snack' ? 'Order + Delivery Button' : 'Reservations')} value={n(c.ga.reservations)} prev={c.gap.reservations} spendNote />
                  <KpiTile label={slug === 'carbon-snack' ? 'Cost / Order + Delivery' : 'Cost / Reservations'} {...kp(slug === 'carbon-snack' ? 'Cost / Order + Delivery' : 'Cost / Reservations')} value={c.gCostPerRes ? fmtD(c.gCostPerRes, 2) : '—'} prev={c.gCostPerResPrev} isNegativeBad={false} />
                  <KpiTile label="Store Visits" {...kp("Store Visits")} value={n(c.ga.storeVisits)} prev={c.gap.storeVisits} spendNote />
                  <KpiTile label="Cost / Store Visits" {...kp("Cost / Store Visits")} value={c.gCostPerVisit ? fmtD(c.gCostPerVisit, 2) : '—'} prev={c.gCostPerVisitPrev} isNegativeBad={false} />
                </>
              }
              chartTitle="Reservations by Date"
              chart={<DailyChart data={c.gaDaily} barKey="spend" barLabel="Spend" lineKey="reservations" lineLabel="Reservations" />}
            />

            {/* ── Toast (carbon-snack only) ── */}
            {slug === 'carbon-snack' && <div style={{ gridColumn: '1 / -1' }}><Panel
              header={<ToastHeader />}
              kpis={
                <>
                  <KpiTile label="Orders" {...kp("Orders")} value={n(c.tw.orders)} prev={c.twp.orders} />
                  <KpiTile label="Amount" {...kp("Amount")} value={c.tw.total ? fmtD(c.tw.total) : '—'} prev={c.twp.total} />
                  <KpiTile label="Size" {...kp("Size")} value={n(c.tw.size)} prev={c.twp.size} />
                  <KpiTile label="Transaction" {...kp("Transaction")} value={n(c.tw.transactions)} prev={c.twp.transactions} />
                </>
              }
              chartTitle="Orders by Month"
              chart={<ToastMonthlyChart data={c.toastMonthly} />}
            /></div>}

            {/* ── OpenTable ── */}
            {slug !== 'carbon-snack' && <Panel
              header={<OpenTableHeader />}
              kpis={
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <KpiTile label="Reservations" {...kp("Reservations")} value={n(c.res.reservations)} prev={c.resp.reservations} />
                    <KpiTile label="Size" {...kp("Size")} value={n(c.res.covers)} prev={c.resp.covers} />
                  </div>
                  <div style={{ background: '#f0f5fb', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ fontSize: '0.67rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>First Visit</div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <input
                        type="number"
                        value={firstVisitOverride !== '' ? firstVisitOverride : (c.fv.firstVisit || '')}
                        onChange={e => setFirstVisitOverride(e.target.value)}
                        placeholder={n(c.fv.firstVisit)}
                        style={{
                          background: 'transparent', border: 'none', outline: 'none',
                          fontSize: '1.1rem', fontWeight: 700, color: '#1e3a5f',
                          width: '80px', padding: 0,
                        }}
                      />
                      <Badge
                        value={firstVisitOverride !== '' ? firstVisitOverride : c.fv.firstVisit}
                        prev={firstVisitPrevOverride !== '' ? firstVisitPrevOverride : c.fvp.firstVisit}
                      />
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>prev: </span>
                      <input
                        type="number"
                        value={firstVisitPrevOverride !== '' ? firstVisitPrevOverride : (c.fvp.firstVisit || '')}
                        onChange={e => setFirstVisitPrevOverride(e.target.value)}
                        placeholder={n(c.fvp.firstVisit)}
                        style={{
                          background: 'transparent', border: 'none', outline: 'none',
                          fontSize: '0.75rem', fontWeight: 600, color: '#64748b',
                          width: '60px', padding: 0,
                        }}
                      />
                    </div>
                  </div>
                  <KpiTile label="Avg Party Size" {...kp("Avg Party Size")} value={c.res.reservations > 0 ? (c.res.covers / c.res.reservations).toFixed(1) : '—'} prev={null} />
                </>
              }
              chartTitle="Reservations by Month"
              chart={<ReservationsMonthlyChart data={c.resChartData} />}
            />}

            {/* ── Perfect Venue ── */}
            {slug !== 'carbon-snack' && <Panel
              header={<PerfectVenueHeader />}
              kpis={
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <KpiTile label="Private Leads" {...kp("Private Leads")} value={n(c.pvW.leads)} prev={c.pvWp.leads} />
                    <KpiTile label="Group Size" {...kp("Group Size")} value={n(c.pvW.groupSize)} prev={c.pvWp.groupSize} />
                  </div>
                  <KpiTile label="Close Rate" {...kp("Close Rate")} value={c.pvCloseRate !== '—' ? `${c.pvCloseRate}%` : '—'} prev={c.pvCloseRatePrev} />
                  <KpiTile label="Book Confirmed" {...kp("Book Confirmed")} value={n(c.pvW.completed)} prev={c.pvWp.completed} />
                </>
              }
              chartTitle="Leads by Month"
              chart={<PvMonthlyChart data={c.pvMonthly} />}
            />}

          </div>
        )}

        {!loading && !c && !error && (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '80px 0' }}>No data available for this period.</div>
        )}

        {lastUpdated && (
          <div style={{ marginTop: 20, color: '#94a3b8', fontSize: '0.7rem', textAlign: 'right' }}>
            Last updated: {new Date(lastUpdated).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}
