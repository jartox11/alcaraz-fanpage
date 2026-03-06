const cache = require('./cache');

const ALCARAZ_ID = 275923;
const BASE = 'https://api.sofascore.com/api/v1';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  'Referer': 'https://www.sofascore.com/',
  'Origin': 'https://www.sofascore.com',
};

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
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      throw new Error(`SofaScore ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    resolve(data);
  } catch (err) {
    console.error(`[SofaScore] Error: ${err.message}`);
    reject(err);
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
  return cachedFetch('player', `${BASE}/team/${ALCARAZ_ID}`, TTL.PLAYER);
}

async function getNextMatches() {
  // Try multiple endpoint formats - SofaScore varies
  const urls = [
    `${BASE}/team/${ALCARAZ_ID}/events/next/0`,
    `${BASE}/team/${ALCARAZ_ID}/events/next`,
    `${BASE}/team/${ALCARAZ_ID}/near-events`,
  ];
  const cached = cache.get('next-matches');
  if (cached && !cached.stale) return cached.data;

  for (const url of urls) {
    try {
      const data = await rateLimitedFetch(url);
      // near-events returns { previousEvent, nextEvent } format
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
  return cachedFetch('recent-matches', `${BASE}/team/${ALCARAZ_ID}/events/last/0`, TTL.RECENT);
}

async function getEvent(eventId) {
  return cachedFetch(`event-${eventId}`, `${BASE}/event/${eventId}`, TTL.EVENT);
}

async function getEventStats(eventId) {
  return cachedFetch(`event-stats-${eventId}`, `${BASE}/event/${eventId}/statistics`, TTL.EVENT);
}

async function getRankings() {
  // Type 6 = ATP Singles rankings
  return cachedFetch('rankings', `${BASE}/rankings/type/6`, TTL.RANKINGS);
}

module.exports = {
  getPlayer,
  getNextMatches,
  getRecentMatches,
  getEvent,
  getEventStats,
  getRankings,
  ALCARAZ_ID,
};
