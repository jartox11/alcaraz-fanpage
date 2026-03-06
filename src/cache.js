class Cache {
  constructor() {
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      // Expired but keep as stale fallback
      return { data: entry.data, stale: true };
    }
    return { data: entry.data, stale: false };
  }

  set(key, data, ttlMs) {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
      cachedAt: Date.now(),
    });
  }

  has(key) {
    const entry = this.store.get(key);
    return entry && Date.now() <= entry.expiresAt;
  }
}

module.exports = new Cache();
