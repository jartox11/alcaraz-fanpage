const axios = require('axios');
const cache = require('./cache');

const ALCARAZ_ID = 275923;

// Try multiple base URLs - some cloud providers get blocked on one but not the other
const BASES = [
  'https://api.sofascore.com/api/v1',
  'https://www.sofascore.com/api/v1',
];

const defaultHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://www.sofascore.com/',
  'Origin': 'https://www.sofascore.com',
  'Connection': 'keep-alive',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  'Sec-Ch-Ua': '"Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
};

const clients = BASES.map(base => axios.create({
  baseURL: base,
  timeout: 15000,
  headers: defaultHeaders,
}));

// Track which base URL works best
let preferredClient = 0;

// Rate limiter: max 1 request every 1.5 seconds
let lastRequest = 0;
const queue = [];
let processing = false;

async function rateLimitedFetch(url) {
  return new Promise((resolve, reject) => {
    queue.push({ url, resolve, reject });
    processQueue();
  });
}

async function processQueue() {
  if (processing || queue.length === 0) return;
  processing = true;

  const { url, resolve, reject } = queue.shift();
  const now = Date.now();
  const wait = Math.max(0, 1500 - (now - lastRequest));

  if (wait > 0) {
    await new Promise(r => setTimeout(r, wait));
  }

  try {
    lastRequest = Date.now();
    console.log(`[SofaScore] Fetching: ${url}`);
    // Try preferred client first, then fallback to others
    let lastErr;
    const order = [preferredClient, ...Array.from({length: clients.length}, (_, i) => i)].filter((v, i, a) => a.indexOf(v) === i);
    for (const idx of order) {
      try {
        const res = await clients[idx].get(url);
        if (idx !== preferredClient) {
          console.log(`[SofaScore] Switching preferred base to ${BASES[idx]}`);
          preferredClient = idx;
        }
        resolve(res.data);
        return;
      } catch (err) {
        lastErr = err;
        console.log(`[SofaScore] Base ${BASES[idx]} failed for ${url}: ${err.response?.status || err.message}`);
      }
    }
    const status = lastErr.response?.status || 'network';
    const msg = lastErr.response?.statusText || lastErr.message;
    console.error(`[SofaScore] All bases failed for ${url}: ${status} ${msg}`);
    reject(new Error(`SofaScore ${status}: ${msg}`));
  } catch (err) {
    const status = err.response?.status || 'network';
    const msg = err.response?.statusText || err.message;
    console.error(`[SofaScore] Error ${status}: ${msg}`);
    reject(new Error(`SofaScore ${status}: ${msg}`));
  } finally {
    processing = false;
    if (queue.length > 0) processQueue();
  }
}

// Cached fetch: returns cached data if fresh, otherwise fetches
async function cachedFetch(key, url, ttlMs) {
  const cached = cache.get(key);
  if (cached && !cached.stale) {
    console.log(`[Cache] HIT: ${key}`);
    return cached.data;
  }

  try {
    const data = await rateLimitedFetch(url);
    cache.set(key, data, ttlMs);
    return data;
  } catch (err) {
    // If fetch fails but we have stale data, return it
    if (cached) {
      console.log(`[Cache] STALE fallback: ${key}`);
      return cached.data;
    }
    throw err;
  }
}

// TTL constants
const TTL = {
  PLAYER:   12 * 60 * 60 * 1000, // 12h
  NEXT:     30 * 60 * 1000,       // 30min
  RECENT:   15 * 60 * 1000,       // 15min
  EVENT:    60 * 60 * 1000,        // 1h
  RANKINGS: 24 * 60 * 60 * 1000,  // 24h
};

// API functions
async function getPlayer() {
  return cachedFetch('player', `/team/${ALCARAZ_ID}`, TTL.PLAYER);
}

async function getNextMatches() {
  const urls = [
    `/team/${ALCARAZ_ID}/events/next/0`,
    `/team/${ALCARAZ_ID}/events/next`,
    `/team/${ALCARAZ_ID}/near-events`,
  ];
  const cached = cache.get('next-matches');
  if (cached && !cached.stale) return cached.data;

  for (const url of urls) {
    try {
      const data = await rateLimitedFetch(url);
      if (data.nextEvent) {
        const wrapped = { events: [data.nextEvent] };
        cache.set('next-matches', wrapped, TTL.NEXT);
        return wrapped;
      }
      if (data.events) {
        cache.set('next-matches', data, TTL.NEXT);
        return data;
      }
    } catch (e) {
      console.log(`[SofaScore] next-matches fallback: ${url} failed (${e.message})`);
    }
  }
  if (cached) return cached.data;
  return { events: [] };
}

async function getRecentMatches() {
  return cachedFetch('recent-matches', `/team/${ALCARAZ_ID}/events/last/0`, TTL.RECENT);
}

async function getAllMatches() {
  const cached = cache.get('all-matches');
  if (cached && !cached.stale) {
    console.log('[Cache] HIT: all-matches');
    return cached.data;
  }

  try {
    const allEvents = [];
    let page = 0;
    const maxPages = 20; // Safety limit

    while (page < maxPages) {
      console.log(`[SofaScore] Fetching career page ${page}...`);
      const data = await rateLimitedFetch(`/team/${ALCARAZ_ID}/events/last/${page}`);
      const events = data.events || [];
      if (events.length === 0) break;
      allEvents.push(...events);
      if (!data.hasNextPage) break;
      page++;
    }

    console.log(`[SofaScore] Total career matches fetched: ${allEvents.length}`);
    const result = { events: allEvents, totalMatches: allEvents.length };
    cache.set('all-matches', result, TTL.RANKINGS); // 24h cache
    return result;
  } catch (err) {
    if (cached) {
      console.log('[Cache] STALE fallback: all-matches');
      return cached.data;
    }
    throw err;
  }
}

async function getEvent(eventId) {
  return cachedFetch(`event-${eventId}`, `/event/${eventId}`, TTL.EVENT);
}

async function getEventStats(eventId) {
  return cachedFetch(`event-stats-${eventId}`, `/event/${eventId}/statistics`, TTL.EVENT);
}

async function getRankings() {
  return cachedFetch('rankings', `/rankings/type/6`, TTL.RANKINGS);
}

module.exports = {
  getPlayer,
  getNextMatches,
  getRecentMatches,
  getAllMatches,
  getEvent,
  getEventStats,
  getRankings,
  ALCARAZ_ID,
};
