const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'he-IL,he;q=0.9',
      },
      timeout: 10000
    }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        const loc = res.headers.location;
        return fetchUrl(loc.startsWith('http') ? loc : new URL(loc, url).href).then(resolve);
      }
      if (res.statusCode !== 200) return resolve('');
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; if (data.length > 2000000) res.destroy(); });
      res.on('end', () => resolve(data));
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

const CITIES = ['תל אביב','יפו','ירושלים','חיפה','באר שבע','נתניה','הרצליה','רמת גן','פתח תקווה','אשדוד','אשקלון','רעננה','כפר סבא','ראשון לציון','רחובות','נס ציונה','קריית מוצקין','חולון','בת ים','מודיעין','עכו','נהריה','טבריה','צפת','אילת','קריית גת','לוד','רמלה','הוד השרון','רמת השרון','גבעתיים','בני ברק','קיסריה','זכרון יעקב','כרמיאל','דימונה','בלומפילד','גגרין'];

function extractCity(text) {
  for (const c of CITIES) { if (text.includes(c)) return c; }
  return '';
}

function parseTickchak(html, type) {
  const shows = [];
  const anchorRe = /<a\s[^>]*href="([^"]*tickchak\.co\.il[^"]*\/event\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = anchorRe.exec(html)) !== null) {
    const url = m[1].split('?')[0];
    const inner = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (inner.length < 5 || inner.length > 600) continue;
    const dateM = inner.match(/(\d{1,2})\s+(\d{2})\.(\d{4})/);
    if (!dateM) continue;
    const date = dateM[1].padStart(2, '0') + '/' + dateM[2] + '/' + dateM[3];
    const timeM = inner.match(/(\d{2}):(\d{2})/);
    const city = extractCity(inner);
    let title = inner
      .replace(/האירוע החל/g, '').replace(/לאתר המכירה/g, '')
      .replace(/קרדיט לצלם[^\u05D0-\u05EA]*/g, '')
      .replace(/\d{1,2}\s+\d{2}\.\d{4}/g, '').replace(/\d{2}:\d{2}/g, '')
      .replace(/יום [א-ז]'/g, '').replace(new RegExp(city, 'g'), '')
      .replace(/\s+/g, ' ').trim();
    if (title.length < 3 || title.length > 120) continue;
    shows.push({ title, city, date, time: timeM ? timeM[1] + ':' + timeM[2] : '', price: '', type, url, source: 'tickchak' });
  }
  return shows;
}

function parseMevalim(html, type) {
  const shows = [];
  const re = /href="(https:\/\/tickets\.mevalim\.co\.il\/event\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = m[1];
    const inner = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (inner.length < 3) continue;
    const priceM = inner.match(/(\d+)\s*\u20aa/);
    const dateM = inner.match(/(\d{1,2})\.(\d{2})/);
    if (!dateM) continue;
    const date = dateM[1].padStart(2, '0') + '/' + dateM[2] + '/2026';
    const timeM = inner.match(/(\d{2}):(\d{2})/);
    const city = extractCity(inner);
    const price = priceM ? '\u20aa' + priceM[1] : '';
    let title = inner
      .replace(/~~[\d\s\u20aa]+~~/g, '').replace(/\d+\s*\u20aa/g, '')
      .replace(/\d{1,2}\.\d{2}/g, '').replace(/\d{2}:\d{2}/g, '')
      .replace(new RegExp(city, 'g'), '').replace(/\s+/g, ' ').trim();
    if (title.length < 2) continue;
    shows.push({ title, city, date, time: timeM ? timeM[1] + ':' + timeM[2] : '', price, type, url, source: 'mevalim' });
  }
  return shows;
}

function extractMevalimArtistLinks(html) {
  const links = new Set();
  const cats = ['shows', 'stand-up', 'concerts', 'theater', 'kids-shows', 'musicals', 'dance'];
  const re = /href="(https:\/\/www\.mevalim\.co\.il\/([^"/]+)\/([^"/]+)\/)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (cats.includes(m[2])) links.add(m[1]);
  }
  return [...links].slice(0, 15);
}

async function fetchMevalim(categoryUrl, type) {
  const html = await fetchUrl(categoryUrl);
  if (!html) return [];
  const direct = parseMevalim(html, type);
  const artistLinks = extractMevalimArtistLinks(html);
  const subs = await Promise.allSettled(artistLinks.map(l => fetchUrl(l).then(h => parseMevalim(h, type))));
  let all = [...direct];
  subs.forEach(r => { if (r.status === 'fulfilled') all = all.concat(r.value); });
  return all;
}

function filterByLocation(shows, locations) {
  if (!locations.length) return shows;
  return shows.filter(s => {
    if (!s.city) return false;
    return locations.some(loc => {
      const clean = loc.replace('תל אביב והסביבה', 'תל אביב').replace(' והסביבה', '').replace(' והקריות', '');
      if (s.city.includes(clean)) return true;
      if (loc.includes('מרכז') && ['תל אביב','יפו','בלומפילד','גגרין','רמת גן','גבעתיים','פתח תקווה','בני ברק','חולון','בת ים'].some(c => s.city.includes(c))) return true;
      if (loc.includes('שרון') && ['נתניה','הרצליה','כפר סבא','רעננה','הוד השרון','רמת השרון'].some(c => s.city.includes(c))) return true;
      if (loc.includes('דרום') && ['באר שבע','אשדוד','אשקלון','קריית גת','דימונה'].some(c => s.city.includes(c))) return true;
      if (loc.includes('צפון') && ['חיפה','עכו','נהריה','טבריה','צפת','קיסריה','זכרון','כרמיאל','קריית מוצקין'].some(c => s.city.includes(c))) return true;
      if (loc.includes('שפלה') && ['ראשון לציון','רחובות','נס ציונה','לוד','רמלה','מודיעין'].some(c => s.city.includes(c))) return true;
      return false;
    });
  });
}

function filterByDate(shows, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return shows;
  return shows.filter(s => {
    if (!s.date) return true;
    const p = s.date.split('/');
    if (p.length < 3) return true;
    const d = p[2] + '-' + p[1] + '-' + p[0];
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
    if (isMuzika) tasks.push(fetchUrl('https://live.tickchak.co.il/shows').then(h => parseTickchak(h, 'מוזיקה')));
    if (isStandup) tasks.push(fetchUrl('https://live.tickchak.co.il/standup').then(h => parseTickchak(h, 'סטאנדאפ')));
    if (isTheater) tasks.push(fetchUrl('https://live.tickchak.co.il/theater').then(h => parseTickchak(h, 'תיאטרון')));
    if (isKids) tasks.push(fetchUrl('https://live.tickchak.co.il/childrens-shows').then(h => parseTickchak(h, 'ילדים')));
    if (isMuzika) tasks.push(fetchMevalim('https://www.mevalim.co.il/shows/', 'מוזיקה'));
    if (isMuzika) tasks.push(fetchMevalim('https://www.mevalim.co.il/concerts/', 'קונצרט'));
    if (isStandup) tasks.push(fetchMevalim('https://www.mevalim.co.il/stand-up/', 'סטאנדאפ'));
    if (isTheater) tasks.push(fetchMevalim('https://www.mevalim.co.il/theater/', 'תיאטרון'));
    if (isKids) tasks.push(fetchMevalim('https://www.mevalim.co.il/kids-shows/', 'ילדים'));

    const results = await Promise.allSettled(tasks);
    let all = [];
    results.forEach(r => { if (r.status === 'fulfilled') all = all.concat(r.value); });

    const seen = new Set();
    all = all.filter(s => { if (!s.url || seen.has(s.url)) return false; seen.add(s.url); return true; });
    all = filterByLocation(all, locations);
    all = filterByDate(all, dateFrom, dateTo);
    all.sort((a, b) => {
      if (!a.date) return 1; if (!b.date) return -1;
      const pa = a.date.split('/'), pb = b.date.split('/');
      return (pa[2] + '-' + pa[1] + '-' + pa[0]).localeCompare(pb[2] + '-' + pb[1] + '-' + pb[0]);
    });

    res.status(200).json({ shows: all.slice(0, 50), total: all.length, sources: ['tickchak', 'mevalim'] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
