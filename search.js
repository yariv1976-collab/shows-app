const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'he-IL,he;q=0.9',
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseShows(html, sourceType) {
  const shows = [];
  const linkPattern = /href="(https:\/\/tickets\.mevalim\.co\.il\/event\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkPattern.exec(html)) !== null) {
    const url = match[1];
    const inner = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!inner || inner.length < 5) continue;

    const priceMatch = inner.match(/(\d+)₪/);
    const price = priceMatch ? '₪' + priceMatch[1] : '';

    const dateMatch = inner.match(/(\d{1,2})\.(\d{2})/);
    const date = dateMatch ? `${dateMatch[1].padStart(2,'0')}/${dateMatch[2]}/2026` : '';

    const timeMatch = inner.match(/(\d{2}):(\d{2})/);
    const time = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : '';

    const cities = ['תל אביב','ירושלים','חיפה','באר שבע','נתניה','הרצליה','רמת גן','פתח תקווה','אשדוד','אשקלון','רעננה','כפר סבא','ראשון לציון','רחובות','נס ציונה','קריית מוצקין','חולון','בת ים','מודיעין','עכו','נהריה','טבריה','צפת','אילת','קריית גת'];
    let city = '';
    for (const c of cities) { if (inner.includes(c)) { city = c; break; } }

    let title = inner
      .replace(/~~[\d₪]+~~/g, '').replace(/\d+₪/g, '')
      .replace(/\d{1,2}\.\d{2}/g, '').replace(/\d{2}:\d{2}/g, '')
      .replace(new RegExp(city, 'g'), '').replace(/\s+/g, ' ').trim();

    if (title.length < 3 || !date) continue;
    shows.push({ title, city, date, time, price, type: sourceType, url });
  }
  return shows;
}

module.exports = async function(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { types = [], locations = [], dateFrom, dateTo } = req.body;

    const pages = [];
    if (types.length === 0 || types.some(t => t.includes('מוזיקה'))) {
      pages.push({ url: 'https://www.mevalim.co.il/shows/', type: 'מוזיקה' });
      pages.push({ url: 'https://www.mevalim.co.il/concerts/', type: 'קונצרט' });
    }
    if (types.length === 0 || types.some(t => t.includes('סטאנדאפ'))) {
      pages.push({ url: 'https://www.mevalim.co.il/stand-up/', type: 'סטאנדאפ' });
    }
    if (types.some(t => t.includes('תיאטרון'))) {
      pages.push({ url: 'https://www.mevalim.co.il/theater/', type: 'תיאטרון' });
    }
    if (types.some(t => t.includes('ילדים'))) {
      pages.push({ url: 'https://www.mevalim.co.il/kids-shows/', type: 'ילדים' });
    }
    if (pages.length === 0) {
      pages.push({ url: 'https://www.mevalim.co.il/shows/', type: 'מוזיקה' });
      pages.push({ url: 'https://www.mevalim.co.il/stand-up/', type: 'סטאנדאפ' });
    }

    const results = await Promise.allSettled(
      pages.map(p => fetchUrl(p.url).then(html => parseShows(html, p.type)))
    );

    let allShows = [];
    results.forEach(r => { if (r.status === 'fulfilled') allShows = allShows.concat(r.value); });

    const seen = new Set();
    allShows = allShows.filter(s => { if (seen.has(s.url)) return false; seen.add(s.url); return true; });

    if (locations.length > 0) {
      allShows = allShows.filter(s => {
        if (!s.city) return true;
        return locations.some(loc =>
          s.city.includes(loc.replace('תל אביב והסביבה','תל אביב')) ||
          (loc.includes('מרכז') && ['תל אביב','רמת גן','גבעתיים','פתח תקווה'].includes(s.city)) ||
          (loc.includes('שרון') && ['נתניה','הרצליה','כפר סבא','רעננה'].includes(s.city)) ||
          (loc.includes('דרום') && ['באר שבע','אשדוד','אשקלון'].includes(s.city)) ||
          (loc.includes('צפון') && ['חיפה','עכו','נהריה','טבריה','צפת'].includes(s.city))
        );
      });
    }

    if (dateFrom || dateTo) {
      allShows = allShows.filter(s => {
        if (!s.date) return true;
        const parts = s.date.split('/');
        if (parts.length < 3) return true;
        const showDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        if (dateFrom && showDate < dateFrom) return false;
        if (dateTo && showDate > dateTo) return false;
        return true;
      });
    }

    res.status(200).json({ shows: allShows.slice(0, 20), source: 'mevalim.co.il' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
