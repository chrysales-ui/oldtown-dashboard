const SHEET_ID = '1ZX_0qzLClX8CthTFux0_Qq__hY-8iOZIORd4M5W_s6c';
const TABS = {
  summary:      0,
  ga:           0,
  facebook:     516008970,
  googleAds:    442706758,
  reservations: 0,
  perfectVenue: 0,
  emails:       265672616,
  emailSent:    2143606700,
  toast:        617086898,
};

function parseCSVLine(line) {
  const result = []; let current = ''; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

function cleanNum(val) {
  if (!val) return 0;
  return parseFloat(val.replace(/[A-Z]{1,3}\$|[$%,₱\s]/g, '')) || 0;
}

async function fetchCSV(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Failed gid=${gid}: ${res.status}`);
  return (await res.text()).split('\n').filter(l => l.trim());
}

// No summary tab — build a synthetic summary from Facebook daily data
async function processSummaryFromFacebook() {
  try {
    const lines = await fetchCSV(TABS.facebook);
    const daily = []; const monthly = {};
    for (let i = 3; i < lines.length; i++) {
      const col = parseCSVLine(lines[i]);
      if (!col[0] || !col[0].match(/^\d{4}-\d{2}-\d{2}/)) continue;
      const date = col[0].trim();
      const mk = date.slice(0, 7);
      // Use reach as a proxy for users when no GA data
      const users = cleanNum(col[3]);
      daily.push({ date, users, sessions: 0 });
      if (!monthly[mk]) monthly[mk] = { month: mk, users: 0, sessions: 0, days: 0 };
      monthly[mk].users += users; monthly[mk].days++;
    }
    return { daily, monthly: Object.values(monthly).sort((a,b) => a.month.localeCompare(b.month)) };
  } catch (e) {
    return { daily: [], monthly: [] };
  }
}

function fbCalc(obj) {
  obj.ctr = obj.impressions > 0 ? +(obj.clicks/obj.impressions*100).toFixed(2) : 0;
  obj.cpc = obj.clicks > 0 ? +(obj.spend/obj.clicks).toFixed(2) : 0;
  obj.cpm = obj.impressions > 0 ? +(obj.spend/obj.impressions*1000).toFixed(2) : 0;
  obj.reservations = obj.resEvent;
  obj.costPerResEvent   = obj.resEvent   > 0 ? +(obj.spend/obj.resEvent).toFixed(2)   : 0;
  obj.costPerResResults = obj.resResults > 0 ? +(obj.spend/obj.resResults).toFixed(2) : 0;
  obj.costPerReservation = obj.costPerResEvent;
  obj.profileToReservation = obj.profileVisits > 0 ? +(obj.resEvent/obj.profileVisits*100).toFixed(2) : 0;
}

async function processFacebook() {
  const lines = await fetchCSV(TABS.facebook);
  const monthly = {}, daily = {}, campaigns = {}, campMonthly = {};
  for (let i = 3; i < lines.length; i++) {
    const col = parseCSVLine(lines[i]);
    if (!col[0] || !col[0].match(/^\d{4}-\d{2}-\d{2}/)) continue;
    const date = col[0].trim();
    const [y, m] = date.split('-');
    const key = `${y}-${m}`;
    const spend = cleanNum(col[4]), reach = cleanNum(col[3]);
    const impr = cleanNum(col[5]), clicks = cleanNum(col[6]);
    const resEvent    = cleanNum(col[17]);
    const resResults  = cleanNum(col[18]);
    const profileVisits = cleanNum(col[20]) || cleanNum(col[21]);
    const resultsType = (col[15]||'').trim();
    const resultsCount = cleanNum(col[14]);
    const thruPlays = cleanNum(col[16]);
    const campaign = (col[11] || 'Unknown').trim();
    const empty = () => ({ spend:0, reach:0, impressions:0, clicks:0, resEvent:0, resResults:0, profileVisits:0, resultsCount:0, thruPlays:0 });
    const add = (obj) => { obj.spend+=spend; obj.reach+=reach; obj.impressions+=impr; obj.clicks+=clicks; obj.resEvent+=resEvent; obj.resResults+=resResults; obj.profileVisits+=profileVisits; obj.resultsCount+=resultsCount; obj.thruPlays+=thruPlays; if(!obj.resultsType&&resultsType) obj.resultsType=resultsType; };
    if (!monthly[key]) monthly[key] = { month: key, ...empty() };
    add(monthly[key]);
    if (!daily[date]) daily[date] = { date, ...empty() };
    add(daily[date]);
    if (!campaigns[campaign]) campaigns[campaign] = { campaign, firstDate: date, lastDate: date, ...empty() };
    add(campaigns[campaign]);
    if (date > campaigns[campaign].lastDate) campaigns[campaign].lastDate = date;
    const campMonKey = `${campaign}||${key}`;
    if (!campMonthly[campMonKey]) campMonthly[campMonKey] = { month: key, campaign, ...empty() };
    add(campMonthly[campMonKey]);
  }
  const arr = Object.values(monthly).sort((a,b) => a.month.localeCompare(b.month));
  arr.forEach(fbCalc);
  const dailyArr = Object.values(daily).sort((a,b) => a.date.localeCompare(b.date));
  dailyArr.forEach(d => {
    d.ctr = d.impressions > 0 ? +(d.clicks/d.impressions*100).toFixed(2) : 0;
    d.cpc = d.clicks > 0 ? +(d.spend/d.clicks).toFixed(2) : 0;
  });
  const campArr = Object.values(campaigns).sort((a,b) => b.spend - a.spend);
  campArr.forEach(fbCalc);
  const campMonthlyArr = Object.values(campMonthly).sort((a,b) => a.month.localeCompare(b.month) || a.campaign.localeCompare(b.campaign));
  campMonthlyArr.forEach(fbCalc);
  return { monthly: arr, daily: dailyArr, campaigns: campArr, campMonthly: campMonthlyArr };
}

async function processGoogleAds() {
  const lines = await fetchCSV(TABS.googleAds);
  const monthly = {}, daily = {}, campaigns = {}, campMonthly = {};
  for (let i = 3; i < lines.length; i++) {
    const col = parseCSVLine(lines[i]);
    if (!col[0] || !col[0].match(/^\d{4}/)) continue;
    const date = col[0].trim();
    const [y, m] = date.split('-');
    const key = `${y}-${m}`;
    const spend = cleanNum(col[1]), impr = cleanNum(col[2]), clicks = cleanNum(col[3]);
    const res = cleanNum(col[10]), storeVisits = cleanNum(col[13]), calls = cleanNum(col[14]);
    const campaign = (col[7] || '').trim();
    if (!monthly[key]) monthly[key] = { month: key, spend: 0, impressions: 0, clicks: 0, reservations: 0, storeVisits: 0, calls: 0 };
    monthly[key].spend += spend; monthly[key].impressions += impr;
    monthly[key].clicks += clicks; monthly[key].reservations += res; monthly[key].storeVisits += storeVisits; monthly[key].calls += calls;
    if (!daily[date]) daily[date] = { date, spend: 0, impressions: 0, clicks: 0, reservations: 0, storeVisits: 0, calls: 0 };
    daily[date].spend += spend; daily[date].impressions += impr;
    daily[date].clicks += clicks; daily[date].reservations += res; daily[date].storeVisits += storeVisits; daily[date].calls += calls;
    if (campaign) {
      if (!campaigns[campaign]) campaigns[campaign] = { name: campaign, spend: 0, clicks: 0, impressions: 0, reservations: 0, storeVisits: 0, calls: 0 };
      campaigns[campaign].spend += spend; campaigns[campaign].clicks += clicks;
      campaigns[campaign].impressions += impr; campaigns[campaign].reservations += res; campaigns[campaign].storeVisits += storeVisits; campaigns[campaign].calls += calls;
      const ck = `${campaign}||${key}`;
      if (!campMonthly[ck]) campMonthly[ck] = { month: key, name: campaign, spend: 0, clicks: 0, impressions: 0, reservations: 0, storeVisits: 0, calls: 0 };
      campMonthly[ck].spend += spend; campMonthly[ck].clicks += clicks;
      campMonthly[ck].impressions += impr; campMonthly[ck].reservations += res; campMonthly[ck].storeVisits += storeVisits; campMonthly[ck].calls += calls;
    }
  }
  const arr = Object.values(monthly).sort((a,b) => a.month.localeCompare(b.month));
  arr.forEach(m => {
    m.ctr = m.impressions > 0 ? +(m.clicks/m.impressions*100).toFixed(2) : 0;
    m.cpc = m.clicks > 0 ? +(m.spend/m.clicks).toFixed(2) : 0;
    m.costPerRes = m.reservations > 0 ? +(m.spend/m.reservations).toFixed(2) : 0;
  });
  const campArr = Object.values(campaigns).map(c => ({
    ...c,
    cpc: c.clicks > 0 ? +(c.spend/c.clicks).toFixed(2) : 0,
    costPerRes: c.reservations > 0 ? +(c.spend/c.reservations).toFixed(2) : 0,
  }));
  const campMonthlyArr = Object.values(campMonthly).sort((a,b) => a.month.localeCompare(b.month)).map(c => ({
    ...c,
    cpc: c.clicks > 0 ? +(c.spend/c.clicks).toFixed(2) : 0,
    costPerRes: c.reservations > 0 ? +(c.spend/c.reservations).toFixed(2) : 0,
  }));
  const dailyArr = Object.values(daily).sort((a,b) => a.date.localeCompare(b.date));
  dailyArr.forEach(d => {
    d.ctr = d.impressions > 0 ? +(d.clicks/d.impressions*100).toFixed(2) : 0;
    d.cpc = d.clicks > 0 ? +(d.spend/d.clicks).toFixed(2) : 0;
    d.costPerRes = d.reservations > 0 ? +(d.spend/d.reservations).toFixed(2) : 0;
  });
  return { monthly: arr, daily: dailyArr, campaigns: campArr, campMonthly: campMonthlyArr };
}

async function processEmail() {
  const [sentLines, subLines] = await Promise.all([fetchCSV(TABS.emailSent), fetchCSV(TABS.emails)]);
  const monthly = {};
  for (let i = 1; i < sentLines.length; i++) {
    const col = parseCSVLine(sentLines[i]);
    const mo = (col[0]||'').trim().match(/(\d+)\/(\d+)\/(\d+)/);
    if (!mo) continue;
    const key = `${mo[3]}-${mo[1].padStart(2,'0')}`;
    const status = (col[3]||'').trim();
    if (!monthly[key]) monthly[key] = { month:key, total:0, delivered:0, opened:0, clicked:0, unsubscribed:0, replied:0 };
    monthly[key].total++;
    if (status==='Delivered') monthly[key].delivered++;
    if (status==='Opened') monthly[key].opened++;
    if (status==='Clicked') monthly[key].clicked++;
    if (status==='Unsubscribed') monthly[key].unsubscribed++;
    if (status==='Replied') monthly[key].replied++;
  }
  const arr = Object.values(monthly).sort((a,b)=>a.month.localeCompare(b.month));
  arr.forEach(m => {
    m.openRate = m.total>0 ? +(m.opened/m.total*100).toFixed(1) : 0;
    m.clickRate = m.total>0 ? +(m.clicked/m.total*100).toFixed(1) : 0;
    m.unsubRate = m.total>0 ? +(m.unsubscribed/m.total*100).toFixed(1) : 0;
  });
  const subMonths = {};
  for (let i = 1; i < subLines.length; i++) {
    const col = parseCSVLine(subLines[i]);
    const mo = (col[0]||'').trim().match(/(\w+)\s+(\d+)\s+(\d+)/);
    if (mo) {
      const mm = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};
      const key = `${mo[3]}-${mm[mo[1]]||'00'}`;
      subMonths[key] = (subMonths[key]||0)+1;
    }
  }
  return {
    monthly: arr,
    subscribersByMonth: Object.entries(subMonths).sort((a,b)=>a[0].localeCompare(b[0])).map(([month,count])=>({month,count})),
    totalSubscribers: subLines.length-1,
  };
}

async function processToast() {
  const lines = await fetchCSV(TABS.toast);
  const headers = lines[0] ? parseCSVLine(lines[0]) : [];
  const monthly = {}, daily = {};
  for (let i = 1; i < lines.length; i++) {
    const col = parseCSVLine(lines[i]);
    // Date is in col[1] "Opened" — format: "M/D/YYYY H:MM AM/PM"
    if (!col[1]) continue;
    const dm = col[1].trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!dm) continue;
    const date = `${dm[3]}-${dm[1].padStart(2,'0')}-${dm[2].padStart(2,'0')}`;
    const key = date.slice(0, 7);
    const size = cleanNum(col[2]);         // # of Guests
    const total = cleanNum(col[10]);       // Total
    if (!monthly[key]) monthly[key] = { month: key, orders: 0, total: 0, size: 0, transactions: 0 };
    monthly[key].orders += 1;
    monthly[key].total += total;
    monthly[key].size += size;
    monthly[key].transactions += 1;
    if (!daily[date]) daily[date] = { date, orders: 0, total: 0, size: 0, transactions: 0 };
    daily[date].orders += 1;
    daily[date].total += total;
    daily[date].size += size;
    daily[date].transactions += 1;
  }
  return {
    headers,
    monthly: Object.values(monthly).sort((a, b) => a.month.localeCompare(b.month)),
    daily: Object.values(daily).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const [summary, facebook, googleAds, email, toast] = await Promise.all([
      processSummaryFromFacebook(), processFacebook(), processGoogleAds(), processEmail(), processToast(),
    ]);
    res.status(200).json({
      summary, facebook, googleAds, email, toast,
      ga: null, reservations: null, perfectVenue: null,
      meta: { lastUpdated: new Date().toISOString(), source: 'live' },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
