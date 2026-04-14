const SHEET_ID = '1J1la6SP8P3OGeeAs7m4jHwAEwj1hnMr0Jm7D6pXs38k';
const TABS = {
  summary:      0,
  allData:      1511134373,
  ga:           245904188,
  facebook:     1801336530,
  googleAds:    255260152,
  reservations: 830275616,
  fbLeads:      1154706868,
  perfectVenue: 166338723,
  emails:       150809214,
  emailSent:    696603548,
  seo:          1916876108,
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

// No dedicated summary tab — build from All Data tab (GID: 1511134373)
async function processSummaryFromAllData() {
  try {
    const lines = await fetchCSV(TABS.allData);
    const daily = []; const monthly = {};
    for (let i = 1; i < lines.length; i++) {
      const col = parseCSVLine(lines[i]);
      let date;
      if (col[0] && col[0].match(/^\d{4}-\d{2}-\d{2}/)) {
        date = col[0].trim().slice(0, 10);
      } else if (col[0] && col[0].match(/\d+\/\d+\/\d+/)) {
        const [mo, d, y] = col[0].split('/');
        if (!y) continue;
        date = `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
      } else continue;
      const users = cleanNum(col[1]), sessions = cleanNum(col[5]);
      const mk = date.slice(0, 7);
      daily.push({ date, users, sessions });
      if (!monthly[mk]) monthly[mk] = { month: mk, users: 0, sessions: 0, days: 0 };
      monthly[mk].users += users; monthly[mk].sessions += sessions; monthly[mk].days++;
    }
    return { daily, monthly: Object.values(monthly).sort((a,b) => a.month.localeCompare(b.month)) };
  } catch (e) {
    return { daily: [], monthly: [] };
  }
}

async function processGA() {
  const lines = await fetchCSV(TABS.ga);
  const daily = []; const monthly = {};
  for (let i = 1; i < lines.length; i++) {
    const col = parseCSVLine(lines[i]);
    if (!col[0] || !col[0].match(/^\d{4}-\d{2}-\d{2}/)) continue;
    const date = col[0].trim().slice(0, 10);
    const mk = date.slice(0, 7);
    const users = cleanNum(col[1]), sessions = cleanNum(col[5]);
    daily.push({ date, users, sessions });
    if (!monthly[mk]) monthly[mk] = { month: mk, users: 0, sessions: 0, days: 0 };
    monthly[mk].users += users; monthly[mk].sessions += sessions; monthly[mk].days++;
  }
  return { daily, monthly: Object.values(monthly).sort((a, b) => a.month.localeCompare(b.month)) };
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
  // New tab layout (Meta Ads Campaign export):
  // col[0]=date, col[2]=campaign, col[5]=results, col[6]=resultType,
  // col[7]=reach, col[12]=spend(CAD), col[14]=impressions, col[16]=link clicks
  const lines = await fetchCSV(TABS.facebook);
  const monthly = {}, daily = {}, campaigns = {}, campMonthly = {}, campDaily = {};
  for (let i = 1; i < lines.length; i++) {
    const col = parseCSVLine(lines[i]);
    if (!col[0] || !col[0].match(/^\d{4}-\d{2}-\d{2}/)) continue;
    const date = col[0].trim().slice(0, 10);
    const [y, m] = date.split('-');
    const key = `${y}-${m}`;
    const campaign = (col[2] || 'Unknown').trim();
    const spend = cleanNum(col[12]);
    const reach = cleanNum(col[7]);
    const impr = cleanNum(col[14]);
    const clicks = cleanNum(col[16]);
    const LEAD_CAMPAIGNS = [
      '[Lead] Coast to Coals',
      '[Lead] Discover The Carbon Bar',
      '[Lead] Private Event / Group Booking',
    ];
    const isLeadCampaign = LEAD_CAMPAIGNS.includes(campaign) || campaign.toLowerCase().startsWith('[lead]');
    const indicator = (col[6] || '').trim();
    const isOTConversion = indicator === 'conversions:offsite_conversion.fb_pixel_custom.opentable_reservation';
    const resultsCount = isLeadCampaign ? cleanNum(col[5]) : 0;
    const otReservations = isOTConversion ? cleanNum(col[5]) : 0;
    const leadSpend = isLeadCampaign ? spend : 0;
    const otSpend = isOTConversion ? spend : 0;
    const empty = () => ({ spend:0, leadSpend:0, otSpend:0, reach:0, impressions:0, clicks:0, resEvent:0, profileVisits:0, thruPlays:0, resultsCount:0, otReservations:0 });
    const add = (obj) => { obj.spend+=spend; obj.leadSpend+=leadSpend; obj.otSpend+=otSpend; obj.reach+=reach; obj.impressions+=impr; obj.clicks+=clicks; obj.resultsCount+=resultsCount; obj.otReservations+=otReservations; };
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
    const campDayKey = `${date}||${campaign}`;
    if (!campDaily[campDayKey]) campDaily[campDayKey] = { date, campaign, ...empty() };
    add(campDaily[campDayKey]);
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
  const campDailyArr = Object.values(campDaily).sort((a,b) => a.date.localeCompare(b.date) || a.campaign.localeCompare(b.campaign));
  campDailyArr.forEach(fbCalc);
  return { monthly: arr, daily: dailyArr, campaigns: campArr, campMonthly: campMonthlyArr, campDaily: campDailyArr };
}

async function processGoogleAds() {
  const lines = await fetchCSV(TABS.googleAds);
  const monthly = {}, daily = {}, campaigns = {}, campMonthly = {}, campDaily = {};
  for (let i = 3; i < lines.length; i++) {
    const col = parseCSVLine(lines[i]);
    if (!col[0] || !col[0].match(/^\d{4}/)) continue;
    const date = col[0].trim();
    const [y, m] = date.split('-');
    const key = `${y}-${m}`;
    const spend = cleanNum(col[1]), impr = cleanNum(col[2]), clicks = cleanNum(col[3]);
    const res = cleanNum(col[10]), storeVisits = cleanNum(col[16]), calls = cleanNum(col[14]);
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
      const cdk = `${date}||${campaign}`;
      if (!campDaily[cdk]) campDaily[cdk] = { date, name: campaign, spend: 0, clicks: 0, impressions: 0, reservations: 0, storeVisits: 0, calls: 0 };
      campDaily[cdk].spend += spend; campDaily[cdk].clicks += clicks;
      campDaily[cdk].impressions += impr; campDaily[cdk].reservations += res; campDaily[cdk].storeVisits += storeVisits; campDaily[cdk].calls += calls;
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
  const campDailyArr = Object.values(campDaily).sort((a,b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  return { monthly: arr, daily: dailyArr, campaigns: campArr, campMonthly: campMonthlyArr, campDaily: campDailyArr };
}

async function processReservations() {
  // New tab column layout (GID 830275616):
  // col[0]=Visit Date (YYYY-MM-DD), col[1]=Visit Time, col[2]=Created Date (YYYY-MM-DD),
  // col[11]=Guest Name, col[13]=Phone, col[14]=Email, col[15]=Marketing Opt-In,
  // col[19]=Size, col[20]=Status,
  // col[86]=First Visit Date (YYYY-MM-DD), col[92]=Lifetime Spend, col[93]=Lifetime Per Cover Spend
  const lines = await fetchCSV(TABS.reservations);
  // Normalize M/D/YYYY or M/D/YY → YYYY-MM-DD
  const normDate = (s) => {
    if (!s) return '';
    const iso = s.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    const mdy = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (mdy) {
      const y = mdy[3].length === 2 ? '20' + mdy[3] : mdy[3];
      return `${y}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;
    }
    return '';
  };
  const emailFirstDate = {};
  const validStatuses = ['Done','Assumed Finished','Confirmed','Paid','Seated'];
  for (let i = 1; i < lines.length; i++) {
    const col = parseCSVLine(lines[i]);
    if (!col[0] || !col[0].match(/^\d{4}-\d{2}-\d{2}/)) continue;
    const visitKey = col[0].trim().slice(0, 10);
    if (parseInt(visitKey.slice(0,4)) < 2020) continue;
    const email = (col[14]||'').trim().toLowerCase();
    const phone = (col[13]||'').trim().replace(/\D/g,'');
    const name  = (col[11]||'').trim().toLowerCase();
    const guestId = email || phone || name || null;
    const status = (col[20]||'').trim();
    if (!guestId || !validStatuses.includes(status)) continue;
    if (!emailFirstDate[guestId] || visitKey < emailFirstDate[guestId]) emailFirstDate[guestId] = visitKey;
  }
  let total = 0, totalCovers = 0, firstVisit = 0, optIn = 0;
  let done = 0, cancelled = 0, noShow = 0;
  const days = { Mon:0,Tue:0,Wed:0,Thu:0,Fri:0,Sat:0,Sun:0 };
  const times = {}, sizes = {}, monthly = {}, daily = {}, firstVisitByVisitDate = {}, repeatByVisitDate = {}, ltSpends = [], ltpcSpends = [];
  // Build guestIndex (email/phone → array of reservation created dates) for FB lead cross-matching
  const guestIndex = {};
  const resRevenueIndex = {}; // email/phone → total POS Paid across all reservations
  for (let i = 1; i < lines.length; i++) {
    const col = parseCSVLine(lines[i]);
    const createdKey = normDate(col[2]);
    if (!createdKey) continue;
    const ge = (col[14] || '').trim().toLowerCase();
    const gp = (col[13] || '').trim().replace(/\D/g, '');
    const ltpc = cleanNum(col[61]);
    for (const k of [ge, gp].filter(Boolean)) {
      if (!guestIndex[k]) guestIndex[k] = [];
      guestIndex[k].push(createdKey);
      if (ltpc > 0) {
        if (!resRevenueIndex[k]) resRevenueIndex[k] = {};
        resRevenueIndex[k][createdKey] = (resRevenueIndex[k][createdKey] || 0) + ltpc;
      }
    }
  }
  for (let i = 1; i < lines.length; i++) {
    const col = parseCSVLine(lines[i]);
    const dateKey = normDate(col[2]);
    if (!dateKey || parseInt(dateKey.slice(0,4)) < 2020) continue;
    const [y, m] = dateKey.split('-');
    const dt = new Date(dateKey + 'T00:00:00Z');
    const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getUTCDay()];
    days[dow] = (days[dow]||0) + 1;
    const tm = (col[1]||'').trim().match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (tm) {
      let h = parseInt(tm[1]);
      if (tm[3].toUpperCase()==='PM' && h!==12) h+=12;
      if (tm[3].toUpperCase()==='AM' && h===12) h=0;
      const label = h===0?'12AM':h<12?`${h}AM`:h===12?'12PM':`${h-12}PM`;
      times[label] = (times[label]||0)+1;
    }
    const size = parseInt(col[19])||0;
    const status = (col[20]||'').trim();
    if (!status) continue;
    const seated = ['Done','Assumed Finished','Confirmed','Paid','Seated'].includes(status);
    const visitRaw = (col[0]||'').trim();
    const visitKey = visitRaw.match(/^\d{4}-\d{2}-\d{2}/) ? visitRaw.slice(0, 10) : '';
    const fvRaw = (col[86]||'').trim();
    const fvKey = fvRaw.match(/^\d{4}-\d{2}-\d{2}/) ? fvRaw.slice(0, 10) : '';
    const email = (col[14]||'').trim().toLowerCase();
    const phone = (col[13]||'').trim().replace(/\D/g,'');
    const name  = (col[11]||'').trim().toLowerCase();
    const guestId = email || phone || name || null;
    const isFirst = (fvKey && visitKey)
      ? fvKey === visitKey
      : (seated && guestId && emailFirstDate[guestId] === visitKey);
    const lt = cleanNum(col[92]);
    const ltpc = cleanNum(col[61]); // POS Paid = column BJ (0-indexed)
    const key = `${y}-${m}`;
    if (!monthly[key]) monthly[key] = { month: key, reservations:0, covers:0, firstVisit:0, repeat:0, cancelled:0, noShow:0 };
    if (!daily[dateKey]) daily[dateKey] = { date: dateKey, reservations:0, covers:0, firstVisit:0, cancelled:0, noShow:0, ltpcSum:0, ltpcCount:0 };
    monthly[key].reservations++; monthly[key].covers += size;
    daily[dateKey].reservations++; daily[dateKey].covers += size;
    if (ltpc > 0) { daily[dateKey].ltpcSum += ltpc; daily[dateKey].ltpcCount++; }
    if (visitKey) {
      const vMonth = visitKey.slice(0,7);
      if (!monthly[vMonth]) monthly[vMonth] = { month: vMonth, reservations:0, covers:0, firstVisit:0, repeat:0, cancelled:0, noShow:0 };
      if (isFirst && ['Done','Assumed Finished'].includes(status)) {
        if (!firstVisitByVisitDate[visitKey]) firstVisitByVisitDate[visitKey] = { date: visitKey, firstVisit: 0 };
        firstVisitByVisitDate[visitKey].firstVisit++;
        monthly[vMonth].firstVisit++;
      } else if (seated && guestId && emailFirstDate[guestId] && visitKey !== emailFirstDate[guestId]) {
        if (!repeatByVisitDate[visitKey]) repeatByVisitDate[visitKey] = { date: visitKey, repeat: 0 };
        repeatByVisitDate[visitKey].repeat++;
        monthly[vMonth].repeat++;
      }
    }
    if (['Canceled','No Show','Not Confirmed'].includes(status)) { monthly[key].cancelled++; daily[dateKey].cancelled++; cancelled++; }
    if (status==='No Show') { monthly[key].noShow++; daily[dateKey].noShow++; noShow++; }
    if (status==='Not Confirmed') { monthly[key].notConfirmed = (monthly[key].notConfirmed||0)+1; daily[dateKey].notConfirmed = (daily[dateKey].notConfirmed||0)+1; }
    if (seated) { monthly[key].seatedRes = (monthly[key].seatedRes||0)+1; monthly[key].seatedCovers = (monthly[key].seatedCovers||0)+size; daily[dateKey].seatedRes = (daily[dateKey].seatedRes||0)+1; daily[dateKey].seatedCovers = (daily[dateKey].seatedCovers||0)+size; }
    if (status==='Done'||status==='Assumed Finished') done++;
    if (isFirst) firstVisit++;
    const isOptIn = (col[15]||'').trim()==='TRUE';
    if (isOptIn) { optIn++; monthly[key].optIn = (monthly[key].optIn||0)+1; daily[dateKey].optIn = (daily[dateKey].optIn||0)+1; }
    if (lt>0) ltSpends.push(lt);
    if (ltpc>0) ltpcSpends.push(ltpc);
    if (size) sizes[size] = (sizes[size]||0)+1;
    total++; totalCovers += size;
  }
  const timeArr = Object.entries(times).map(([t,c])=>({time:t,count:c})).sort((a,b)=>{const order=['12AM','1AM','2AM','3AM','4AM','5AM','6AM','7AM','8AM','9AM','10AM','11AM','12PM','1PM','2PM','3PM','4PM','5PM','6PM','7PM','8PM','9PM','10PM','11PM'];return order.indexOf(a.time)-order.indexOf(b.time);});
  return {
    summary: {
      total, totalCovers, firstVisit, done, cancelled, noShow,
      returnRate: +((total-firstVisit)/total*100).toFixed(1),
      optInRate: +(optIn/total*100).toFixed(1),
      avgLifetimeSpend: ltSpends.length ? +(ltSpends.reduce((a,b)=>a+b,0)/ltSpends.length).toFixed(2) : 0,
      avgLifetimePerCoverSpend: ltpcSpends.length ? +(ltpcSpends.reduce((a,b)=>a+b,0)/ltpcSpends.length).toFixed(2) : 0
    },
    days,
    times: timeArr,
    sizes: Object.entries(sizes).map(([s,c])=>({size:parseInt(s),count:c})).sort((a,b)=>a.size-b.size),
    monthly: Object.values(monthly).sort((a,b)=>a.month.localeCompare(b.month)),
    daily: Object.values(daily).sort((a,b)=>a.date.localeCompare(b.date)),
    firstVisitDaily: Object.values(firstVisitByVisitDate).sort((a,b)=>a.date.localeCompare(b.date)),
    repeatDaily: Object.values(repeatByVisitDate).sort((a,b)=>a.date.localeCompare(b.date)),
    guestIndex, resRevenueIndex,
  };
}

async function processPerfectVenue() {
  const lines = await fetchCSV(TABS.perfectVenue);
  const statuses = {}, lostReasons = {}, monthly = {}, pvDaily = {}, sources = {};
  let completedRev = 0, completedCount = 0;
  const headers = parseCSVLine(lines[0] || '');
  const sourceColIdx = headers.findIndex(h => /source|lead source/i.test(h));
  // Build guest index: email → array of inquiry created dates (for FB lead cross-match)
  const pvGuestIndex = {};
  // Build revenue index: email → total revenue from completed events
  const pvRevenueIndex = {};
  for (let i = 1; i < lines.length; i++) {
    const col = parseCSVLine(lines[i]);
    if (!col[1]) continue;
    const status = (col[3]||'').trim();
    const source = (col[18]||'').trim();
    const origin = (col[21]||'').trim();
    const sourceVal = source || origin;
    const lostReason = (col[28]||'').trim().replace(/['"]/g,'');
    const proposalTotal = cleanNum(col[42]);
    const totalPaid     = cleanNum(col[43]);
    const balanceDue    = cleanNum(col[44]);
    const budget        = cleanNum(col[41]);
    const revenueValue  = totalPaid > 0 ? totalPaid : (balanceDue > 0 ? balanceDue : (proposalTotal > 0 ? proposalTotal : budget));
    const groupSize = cleanNum(col[15]);
    const createdOn = (col[22]||'').trim();
    statuses[status] = (statuses[status]||0)+1;
    if (sourceVal) sources[sourceVal] = (sources[sourceVal]||0)+1;
    const isContactForm = /contact.?form|website.?form/i.test(sourceVal);
    if (lostReason && status==='Lost') lostReasons[lostReason] = (lostReasons[lostReason]||0)+1;
    const pvEmail = (col[9]||'').trim().toLowerCase();
    if (pvEmail && createdOn.match(/\d+\/\d+\/\d+/)) {
      const [pm, pd, py] = createdOn.split('/');
      const pvDateKey = `${py.length === 2 ? '20'+py : py}-${pm.padStart(2,'0')}-${pd.padStart(2,'0')}`;
      if (!pvGuestIndex[pvEmail]) pvGuestIndex[pvEmail] = [];
      pvGuestIndex[pvEmail].push(pvDateKey);
      // Track revenue for completed events per email for matched lead revenue calc
      if (status === 'Completed' && revenueValue > 0) {
        if (!pvRevenueIndex[pvEmail]) pvRevenueIndex[pvEmail] = 0;
        pvRevenueIndex[pvEmail] += revenueValue;
      }
    }
    if (createdOn && createdOn.match(/\d+\/\d+\/\d+/)) {
      const parts = createdOn.split('/');
      const [m, d, y] = parts;
      if (y) {
        const key = `${y}-${m.padStart(2,'0')}`;
        const dateKey = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
        if (!monthly[key]) monthly[key] = { month: key, leads:0, completed:0, lost:0, groupSize:0, proposalTotal:0, revenueValue:0 };
        if (!pvDaily[dateKey]) pvDaily[dateKey] = { date: dateKey, leads:0, completed:0, lost:0, groupSize:0, proposalTotal:0, revenueValue:0 };
        if (isContactForm) {
          monthly[key].leads++; pvDaily[dateKey].leads++;
          monthly[key].groupSize += groupSize; pvDaily[dateKey].groupSize += groupSize;
          if (status==='Completed' || status==='Confirmed') {
            monthly[key].completed++; pvDaily[dateKey].completed++;
            if (proposalTotal > 0) { monthly[key].proposalTotal += proposalTotal; pvDaily[dateKey].proposalTotal += proposalTotal; }
            if (revenueValue > 0) { monthly[key].revenueValue += revenueValue; pvDaily[dateKey].revenueValue += revenueValue; }
          }
          if (status==='Lost') { monthly[key].lost++; pvDaily[dateKey].lost++; }
        }
      }
    }
    if (status==='Completed' && revenueValue>0) { completedRev+=revenueValue; completedCount++; }
  }
  return {
    pvGuestIndex, pvRevenueIndex,
    statuses: Object.entries(statuses).map(([s,c])=>({status:s,count:c})).sort((a,b)=>b.count-a.count),
    sources: Object.entries(sources).map(([s,c])=>({source:s,count:c})).sort((a,b)=>b.count-a.count),
    sourceColIdx,
    headers: headers.slice(0, 50),
    lostReasons: Object.entries(lostReasons).filter(([r])=>r.length>1).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([reason,count])=>({reason,count})),
    monthly: Object.values(monthly).sort((a,b)=>a.month.localeCompare(b.month)),
    daily: Object.values(pvDaily).sort((a,b)=>a.date.localeCompare(b.date)),
    totalCompletedRevenue: +completedRev.toFixed(0),
    avgRevenuePerEvent: completedCount>0 ? +(completedRev/completedCount).toFixed(0) : 0,
    closeRate: statuses.Completed && statuses.Lost ? +((statuses.Completed/(statuses.Completed+statuses.Lost))*100).toFixed(1) : 0,
  };
}

async function processSEO() {
  const lines = await fetchCSV(TABS.seo);
  const daily = [];
  for (let i = 1; i < lines.length; i++) {
    const col = parseCSVLine(lines[i]);
    if (!col[0] || !col[0].match(/^\d{4}-\d{2}-\d{2}/)) continue;
    const date = col[0].trim().slice(0, 10);
    const clicks = cleanNum(col[1]);
    const impressions = cleanNum(col[2]);
    const ctr = cleanNum(col[3]);
    const position = cleanNum(col[4]);
    daily.push({ date, clicks, impressions, ctr, position });
  }
  return { daily };
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

async function processFacebookLeads(reservationGuestIndex, pvGuestIndex = {}, pvRevenueIndex = {}, resRevenueIndex = {}) {
  const lines = await fetchCSV(TABS.fbLeads);
  const daily = {}, monthly = {};
  let totalLeads = 0, matched = 0, newGuests = 0, returning = 0, pvMatched = 0, pePvMatchedRevenue = 0, metaLeadRevenue = 0;
  const seenPeEmails = new Set();
  const seenMatchedGuests = new Set();  // prevents double-counting revenue
  const seenDetailGuests = new Set();   // prevents duplicate detail entries

  for (let i = 1; i < lines.length; i++) {
    const col = parseCSVLine(lines[i]);
    const createdRaw = (col[1] || '').trim();
    if (!createdRaw) continue;
    const dateKey = createdRaw.slice(0, 10); // YYYY-MM-DD
    const monthKey = dateKey.slice(0, 7);
    const email = (col[13] || '').trim().toLowerCase();
    const phone = (col[14] || '').trim().replace(/\D/g, '');
    const campaign = (col[7] || '').trim();

    if (!daily[dateKey]) daily[dateKey] = { date: dateKey, leads: 0, matched: 0, newGuests: 0, returning: 0 };
    if (!monthly[monthKey]) monthly[monthKey] = { month: monthKey, leads: 0, matched: 0, newGuests: 0, returning: 0, campaigns: {} };

    daily[dateKey].leads++;
    monthly[monthKey].leads++;
    totalLeads++;

    // Cross-match against Perfect Venue: email match where PV inquiry created on or after this FB lead date
    if (email && pvGuestIndex[email]) {
      const hasPVMatch = pvGuestIndex[email].some(pvDate => pvDate >= dateKey);
      if (hasPVMatch) {
        pvMatched++;
        daily[dateKey].pvMatched = (daily[dateKey].pvMatched || 0) + 1;
      }
    }

    // Cross-match against OpenTable using reservation created dates
    const guestKey = email || phone;
    if (guestKey && reservationGuestIndex[guestKey]) {
      const createdDates = reservationGuestIndex[guestKey]; // array of YYYY-MM-DD reservation created dates
      // Match if this person has a reservation created on or after the lead date
      const hasMatch = createdDates.some(d => d >= dateKey);
      if (hasMatch) {
        matched++;
        daily[dateKey].matched++;
        monthly[monthKey].matched++;
        const earliest = createdDates.slice().sort()[0];
        if (earliest >= dateKey) {
          newGuests++;
          daily[dateKey].newGuests++;
          monthly[monthKey].newGuests++;
        } else {
          returning++;
          daily[dateKey].returning++;
          monthly[monthKey].returning++;
        }
        // revenue: count once across all time
        if (!seenMatchedGuests.has(guestKey)) {
          if (resRevenueIndex[guestKey]) {
            for (const [resDate, amt] of Object.entries(resRevenueIndex[guestKey])) {
              metaLeadRevenue += amt;
              if (!daily[resDate]) daily[resDate] = { date: resDate, leads: 0, matched: 0, newGuests: 0, returning: 0 };
              daily[resDate].metaLeadRevenue = (daily[resDate].metaLeadRevenue || 0) + amt;
            }
          }
          seenMatchedGuests.add(guestKey);
        }
        // detail entry: record once per guest on lead date
        if (!seenDetailGuests.has(guestKey)) {
          if (!daily[dateKey].matchedGuests) daily[dateKey].matchedGuests = [];
          const guestRevDates = resRevenueIndex[guestKey] || {};
          const hasPos = Object.keys(guestRevDates).length > 0;
          const posTotal = Object.values(guestRevDates).reduce((s, v) => s + v, 0);
          daily[dateKey].matchedGuests.push({ key: guestKey, email: email || '', phone: phone || '', amount: posTotal, resCount: hasPos ? Object.keys(guestRevDates).length : createdDates.length, hasPos });
          seenDetailGuests.add(guestKey);
        }
      }
    }

    // Track campaigns
    const isPECampaign = campaign.toLowerCase().includes('private event') || campaign.toLowerCase().includes('group booking');
    if (campaign) {
      if (!monthly[monthKey].campaigns[campaign]) monthly[monthKey].campaigns[campaign] = { leads: 0, matched: 0, newGuests: 0, pvMatched: 0 };
      monthly[monthKey].campaigns[campaign].leads++;
      if (guestKey && reservationGuestIndex[guestKey]) {
        const createdDates = reservationGuestIndex[guestKey];
        if (createdDates.some(d => d >= dateKey)) {
          monthly[monthKey].campaigns[campaign].matched++;
          const earliest = createdDates.slice().sort()[0];
          if (earliest >= dateKey) monthly[monthKey].campaigns[campaign].newGuests++;
        }
      }
      // Track PE leads matched in Perfect Venue
      if (isPECampaign && email && pvGuestIndex[email]) {
        const hasPVMatch = pvGuestIndex[email].some(pvDate => pvDate >= dateKey);
        if (hasPVMatch) monthly[monthKey].campaigns[campaign].pvMatched++;
      }
    }

    // Track PE daily pvMatched separately + revenue from matched leads
    if (isPECampaign && email && pvGuestIndex[email]) {
      const hasPVMatch = pvGuestIndex[email].some(pvDate => pvDate >= dateKey);
      if (hasPVMatch) {
        daily[dateKey].pePvMatched = (daily[dateKey].pePvMatched || 0) + 1;
        if (!seenPeEmails.has(email) && pvRevenueIndex[email]) {
          pePvMatchedRevenue += pvRevenueIndex[email];
          daily[dateKey].pePvMatchedRevenue = (daily[dateKey].pePvMatchedRevenue || 0) + pvRevenueIndex[email];
          seenPeEmails.add(email);
        }
      }
    }
  }

  // Sum PE PV matches across all daily entries
  const pePvMatched = Object.values(daily).reduce((sum, d) => sum + (d.pePvMatched || 0), 0);

  const matchRate = totalLeads > 0 ? +(matched / totalLeads * 100).toFixed(1) : 0;
  return {
    summary: { totalLeads, matched, newGuests, returning, matchRate, pvMatched, pePvMatched, pePvMatchedRevenue, metaLeadRevenue },
    daily: Object.values(daily).sort((a, b) => a.date.localeCompare(b.date)),
    monthly: Object.values(monthly).sort((a, b) => a.month.localeCompare(b.month)),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const safe = (fn, fallback) => fn().catch(e => { console.error(fn.name, e.message); return fallback; });
    const emptyFb = { monthly: [], daily: [], campaigns: [], campMonthly: [], campDaily: [] };
    const emptyFbLeads = { summary: { totalLeads:0, matched:0, newGuests:0, returning:0, matchRate:0, pvMatched:0, pePvMatched:0, pePvMatchedRevenue:0, metaLeadRevenue:0 }, daily: [], monthly: [] };

    const [summary, ga, facebook, googleAds, reservations, perfectVenue, email, seo] = await Promise.all([
      safe(processSummaryFromAllData, { daily: [], monthly: [] }),
      safe(processGA,                 { daily: [], monthly: [] }),
      safe(processFacebook,           emptyFb),
      safe(processGoogleAds,          { monthly: [], daily: [], campaigns: [], campMonthly: [], campDaily: [] }),
      safe(processReservations,       { summary:{}, days:{}, times:[], sizes:[], monthly:[], daily:[], firstVisitDaily:[], repeatDaily:[], guestIndex:{} }),
      safe(processPerfectVenue,       { pvGuestIndex:{}, statuses:[], sources:[], lostReasons:[], monthly:[], daily:[], totalCompletedRevenue:0, avgRevenuePerEvent:0, closeRate:0 }),
      safe(processEmail,              { monthly:[], subscribersByMonth:[], totalSubscribers:0 }),
      safe(processSEO,                { daily:[] }),
    ]);

    const fbLeads = await safe(() => processFacebookLeads(reservations.guestIndex, perfectVenue.pvGuestIndex, perfectVenue.pvRevenueIndex || {}, reservations.resRevenueIndex || {}), emptyFbLeads);

    const { guestIndex: _gi, ...reservationsOut } = reservations;
    res.status(200).json({
      summary, ga, facebook, googleAds,
      reservations: reservationsOut, perfectVenue, email, seo, fbLeads,
      meta: { lastUpdated: new Date().toISOString(), source: 'live' },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
