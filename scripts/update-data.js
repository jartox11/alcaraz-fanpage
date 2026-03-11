#!/usr/bin/env node
/**
 * Pre-cache SofaScore data as static JSON files.
 * Run this locally (where SofaScore isn't blocked) to update data.
 * Usage: node scripts/update-data.js
 * Then commit and push the generated files in public/data/
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const ALCARAZ_ID = 275923;
const BASE = 'https://api.sofascore.com/api/v1';
const DATA_DIR = path.join(__dirname, '..', 'public', 'data');

const client = axios.create({
  baseURL: BASE,
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    'Referer': 'https://www.sofascore.com/',
    'Origin': 'https://www.sofascore.com',
  },
});

// Rate limiter
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      await sleep(1500); // Rate limit
      console.log(`  Fetching: ${url}`);
      const res = await client.get(url);
      return res.data;
    } catch (err) {
      if (i === retries) throw err;
      console.log(`  Retry ${i + 1}...`);
      await sleep(3000);
    }
  }
}

async function main() {
  console.log('🎾 Updating Alcaraz Fan Hub data...\n');

  // Ensure data directory exists
  fs.mkdirSync(DATA_DIR, { recursive: true });

  // 1. Player profile
  console.log('📋 Player profile...');
  try {
    const player = await fetchWithRetry(`/team/${ALCARAZ_ID}`);
    fs.writeFileSync(path.join(DATA_DIR, 'player.json'), JSON.stringify(player, null, 2));
    console.log('  ✓ player.json\n');
  } catch (e) { console.error('  ✗ Player failed:', e.message, '\n'); }

  // 2. Recent matches
  console.log('📅 Recent matches...');
  try {
    const recent = await fetchWithRetry(`/team/${ALCARAZ_ID}/events/last/0`);
    fs.writeFileSync(path.join(DATA_DIR, 'recent-matches.json'), JSON.stringify(recent, null, 2));
    console.log('  ✓ recent-matches.json\n');
  } catch (e) { console.error('  ✗ Recent matches failed:', e.message, '\n'); }

  // 3. Next matches / near events
  console.log('🔜 Next matches...');
  try {
    let nextData;
    try {
      nextData = await fetchWithRetry(`/team/${ALCARAZ_ID}/events/next/0`);
    } catch (e) {
      nextData = await fetchWithRetry(`/team/${ALCARAZ_ID}/near-events`);
    }
    if (nextData.nextEvent) {
      nextData = { events: [nextData.nextEvent] };
    }
    fs.writeFileSync(path.join(DATA_DIR, 'next-matches.json'), JSON.stringify(nextData, null, 2));
    console.log('  ✓ next-matches.json\n');
  } catch (e) { console.error('  ✗ Next matches failed:', e.message, '\n'); }

  // 4. Rankings
  console.log('🏆 Rankings...');
  try {
    const rankings = await fetchWithRetry('/rankings/type/6');
    fs.writeFileSync(path.join(DATA_DIR, 'rankings.json'), JSON.stringify(rankings, null, 2));
    console.log('  ✓ rankings.json\n');
  } catch (e) { console.error('  ✗ Rankings failed:', e.message, '\n'); }

  // 5. All career matches (paginated)
  console.log('🎾 All career matches (this takes a while)...');
  try {
    const allEvents = [];
    let page = 0;
    const maxPages = 25;

    while (page < maxPages) {
      console.log(`  Page ${page}...`);
      const data = await fetchWithRetry(`/team/${ALCARAZ_ID}/events/last/${page}`);
      const events = data.events || [];
      if (events.length === 0) break;
      allEvents.push(...events);
      if (!data.hasNextPage) break;
      page++;
    }

    const result = { events: allEvents, totalMatches: allEvents.length };
    fs.writeFileSync(path.join(DATA_DIR, 'all-matches.json'), JSON.stringify(result, null, 2));
    console.log(`  ✓ all-matches.json (${allEvents.length} matches)\n`);
  } catch (e) { console.error('  ✗ All matches failed:', e.message, '\n'); }

  // Write timestamp
  const meta = {
    updatedAt: new Date().toISOString(),
    updatedBy: 'scripts/update-data.js',
  };
  fs.writeFileSync(path.join(DATA_DIR, '_meta.json'), JSON.stringify(meta, null, 2));

  console.log('✅ Data update complete!');
  console.log(`📁 Files in: ${DATA_DIR}`);
  console.log('💡 Now run: git add public/data && git commit -m "Update data" && git push');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
