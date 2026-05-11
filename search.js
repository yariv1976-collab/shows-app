const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
      },
      timeout: 8000
    };
    const req = https.get(url, options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        if (loc) return fetchUrl(loc.startsWith('http') ? loc : new URL(loc, url).href).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return resolve('');
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; if (data.length > 500000) res.destroy(); });
      res.on('end', () => resolve(data));
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

const CITIES = ['תל אביב','יפו','ירושלים','חיפה','באר שבע','נתניה','הרצליה','רמת גן','פתח תקווה','אשדוד','אשקלון','רעננה','כפר סבא','ראשון לציון','רחובות','נס ציונה','קריית מוצקין','חולון','בת ים','מודיעין','עכו','נהריה','טבריה','צפת','אילת','קריית גת','לוד','רמלה','הוד השרון','רמת השרון','גבעתיים','בני ברק','קיסריה','זכרון יעקב'];

function extractCity(text) {
  for (const c of CITIES) { if (text.includes(c)) return c; }
  return '';
}

// ---- MEVALIM parser ----
function parseMevalim(html, type) {
  const shows = [];
  const re = /href="(https:\/\/tickets\.mevalim\.co\.il\/event\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = m[1];
    const inner = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (inner.length < 5) continue;
    const price = (inner.match(/(\d+)₪/) || [])[1];
    const dm = inner.match(/(\d{1,2})\.(\d{2})/);
    if (!dm) continue;
    const date = `${dm[1].padStart(2,'0')}/${dm[2]}/2026`;
    const tm = inner.match(/(\d{2}):(\d{2})/);
    const time = tm ? `${tm[1]}:${tm[2]}` : '';
    const city = extractCity(inner);
    let title = inner.replace(/~~[\d₪]+~~/g,'').replace(/\d+₪/g,'').replace(/\d{1,2}\.\d{2}/g,'').replace(/\d{2}:\d{2}/g,'').replace(new RegExp(city,'g'),'').replace(/\s+/g,' ').trim();
    if (title.length < 3) continue;
    shows.push({ title, city, date, time, price: price ? '₪'+price : '', type, url, source: 'mevalim' });
  }
  return shows;
}

// ---- TICKCHAK parser ----
function parseTickchak(html, type) {
  const shows = [];
  const re = /href="(https:\/\/(?:www\.)?tickchak\.co\.il\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!m[1].includes('/event') && !m[1].match(/\/\d+/)) continue;
    const url = m[1];
    const inner = m[2].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
    if (inner.length < 3) continue;
    const dm = inner.match(/(\d{1,2})[.\/\-](\d{2})/);
    if (!dm) continue;
    const date = `${dm[1].padStart(2,'0')}/${dm[2]}/2026`;
    const tm = inner.match(/(\d{2}):(\d{2})/);
    const city = extractCity(inner);
    const price = (inner.match(/(\d+)\s*₪/) || [])[1];
    let title = inner.replace(/\d{1,2}[.\/\-]\d{2}/g,'').replace(/\d{2}:\d{2}/g,'').replace(/\d+₪/g,'').replace(new RegExp(city,'g'),'').replace(/\s+/g,' ').trim();
    if (title.length < 3) continue;
    shows.push({ title, city, date, time: tm?`${tm[1]}:${tm[2]}`:'', price: price?'₪'+price:'', type, url, source: 'tickchak' });
  }
  return shows;
}

// ---- MUZI parser ----
function parseMuzi(html, type) {
  const shows = [];
  const re = /href="(https:\/\/muzi\.co\.il\/event\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = m[1];
    const inner = m[2].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
    if (inner.length < 3) continue;
    const dm = inner.match(/(\d{1,2})[.\/](\d{2})/);
    const date = dm ? `${dm[1].padStart(2,'0')}/${dm[2]}/2026` : '';
    const tm = inner.match(/(\d{2}):(\d{2})/);
    const city = extractCity(inner);
    const price = (inner.match(/(\d+)\s*₪/) || [])[1];
    let title = inner.replace(/\d{1,2}[.\/]\d{2}/g,'').replace(/\d{2}:\d{2}/g,'').replace(/\d+\s*₪/g,'').replace(new RegExp(city,'g'),'').replace(/\s+/g,' ').trim();
    if (title.length < 3) continue;
    shows.push({ title, city, date, time: tm?`${tm[1]}:${tm[2]}`:'', price: price?'₪'+price:'', type, url, source: 'muzi' });
  }
  return shows;
}

// ---- KUPAT parser ----
function parseKupat(html, type) {
  const shows = [];
  const re = /href="(https:\/\/(?:www\.)?kupat\.co\.il\/[^"#?]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1].includes('terms') || m[1].includes('contact') || m[1].includes('about') || m[1] === 'https://www.kupat.co.il/') continue;
    const url = m[1];
    const inner = m[2].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
    if (inner.length < 3) continue;
    const dm = inner.match(/(\d{1,2})[.\/](\d{2})/);
    const date = dm ? `${dm[1].padStart(2,'0')}/${dm[2]}/2026` : '';
    const city = extractCity(inner);
    const price = (inner.match(/(\d+)\s*₪/) || [])[1];
    shows.push({ title: inner.replace(/\d{1,2}[.\/]\d{2}/g,'').replace(/\d+\s*₪/g,'').replace(new RegExp(city,'g'),'').replace(/\s+/g,' ').trim(), city, date, time:'', price: price?'₪'+price:'', type, url, source: 'kupat' });
  }
  return shows.filter(s => s.title.length > 2);
}

function filterByLocation(shows, locations) {
  if (!locations.length) return shows;
  return shows.filter(s => {
    if (!s.city) return false;
    return locations.some(loc =>
      s.city.includes(loc.replace('תל אביב והסביבה','תל אביב').replace(' והסביבה','').replace(' והקריות','')) ||
      (loc.includes('מרכז') && ['תל אביב','יפו','רמת גן','גבעתיים','פתח תקווה','בני ברק','חולון','בת ים'].some(c => s.city.includes(c))) ||
      (loc.includes('שרון') && ['נתניה','הרצליה','כפר סבא','רעננה','הוד השרון','רמת השרון'].some(c => s.city.includes(c))) ||
      (loc.includes('דרום') && ['באר שבע','אשדוד','אשקלון','קריית גת'].some(c => s.city.includes(c))) ||
      (loc.includes('צפון') && ['חיפה','עכו','נהריה','טבריה','צפת','קיסריה','זכרון'].some(c => s.city.includes(c))) ||
      (loc.includes('שפלה') && ['ראשון לציון','רחובות','נס ציונה','לוד','רמלה','מודיעין'].some(c => s.city.includes(c)))
    );
  });
}

function filterByDate(shows, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return shows;
  return shows.filter(s => {
    if (!s.date) return true;
    const p = s.date.split('/');
    if (p.length < 3) return true;
    const d = `${p[2]}-${p[1]}-${p[0]}`;
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  });
}

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { types = [], locations = [], dateFrom, dateTo } = req.body;
    const isMuzika = !types.length || types.some(t => t.includes('מוזיקה'));
    const isStandup = !types.length || types.some(t => t.includes('סטאנדאפ'));
    const isTheater = types.some(t => t.includes('תיאטרון'));
    const isKids = types.some(t => t.includes('ילדים'));

    const tasks = [];

    // MEVALIM
    if (isMuzika) {
      tasks.push(fetchUrl('https://www.mevalim.co.il/shows/').then(h => parseMevalim(h, 'מוזיקה')));
      tasks.push(fetchUrl('https://www.mevalim.co.il/concerts/').then(h => parseMevalim(h, 'קונצרט')));
    }
    if (isStandup) tasks.push(fetchUrl('https://www.mevalim.co.il/stand-up/').then(h => parseMevalim(h, 'סטאנדאפ')));
    if (isTheater) tasks.push(fetchUrl('https://www.mevalim.co.il/theater/').then(h => parseMevalim(h, 'תיאטרון')));
    if (isKids) tasks.push(fetchUrl('https://www.mevalim.co.il/kids-shows/').then(h => parseMevalim(h, 'ילדים')));

    // TICKCHAK
    if (isMuzika) tasks.push(fetchUrl('https://live.tickchak.co.il/shows').then(h => parseTickchak(h, 'מוזיקה')));
    if (isStandup) tasks.push(fetchUrl('https://live.tickchak.co.il/standup').then(h => parseTickchak(h, 'סטאנדאפ')));
    if (isTheater) tasks.push(fetchUrl('https://live.tickchak.co.il/theater').then(h => parseTickchak(h, 'תיאטרון')));
    if (isKids) tasks.push(fetchUrl('https://live.tickchak.co.il/childrens-shows').then(h => parseTickchak(h, 'ילדים')));

    // MUZI (מוזיקה בלבד)
    if (isMuzika) tasks.push(fetchUrl('https://muzi.co.il/events-by-date/').then(h => parseMuzi(h, 'מוזיקה')));

    // KUPAT
    if (isMuzika) tasks.push(fetchUrl('https://www.kupat.co.il/').then(h => parseKupat(h, 'מוזיקה')));

    const results = await Promise.allSettled(tasks);
    let all = [];
    results.forEach(r => { if (r.status === 'fulfilled') all = all.concat(r.value); });

    // Deduplicate by URL
    const seen = new Set();
    all = all.filter(s => { if (!s.url || seen.has(s.url)) return false; seen.add(s.url); return true; });

    all = filterByLocation(all, locations);
    all = filterByDate(all, dateFrom, dateTo);

    // Sort by date
    all.sort((a, b) => {
      if (!a.date) return 1; if (!b.date) return -1;
      const pa = a.date.split('/'), pb = b.date.split('/');
      const da = `${pa[2]}-${pa[1]}-${pa[0]}`, db = `${pb[2]}-${pb[1]}-${pb[0]}`;
      return da.localeCompare(db);
    });

    res.status(200).json({ shows: all.slice(0, 30), total: all.length, sources: ['mevalim', 'tickchak', 'muzi', 'kupat'] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
