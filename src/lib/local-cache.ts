/**
 * local-cache.ts – IndexedDB cache for Supabase data
 * ====================================================
 * Provides instant data access on Lovable (no backend needed).
 *
 * Strategy: "stale-while-revalidate"
 *  1. First visit  → fetch from Supabase, store in IndexedDB
 *  2. Next visits  → return from IndexedDB instantly, refresh in background
 *  3. Data expires after CACHE_TTL_MS (1 hour default)
 */

const DB_NAME = "kfar-chabad-cache";
const DB_VERSION = 1;
const STORE_NAME = "api_cache";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry {
  key: string;
  data: unknown;
  timestamp: number;
}

// ─── IndexedDB helpers ──────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function cacheGet(key: string): Promise<CacheEntry | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function cacheSet(key: string, data: unknown): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put({ key, data, timestamp: Date.now() } as CacheEntry);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Cache write failures are non-critical
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Wrap a fetch function with IndexedDB caching.
 * Returns cached data immediately if available, fetches fresh data in background.
 *
 * @param cacheKey - Unique key for this data (e.g. "plans:7188:90")
 * @param fetchFn - The actual fetch function (e.g. Supabase query)
 * @param ttl - Cache TTL in ms (default: 1 hour)
 */
export async function withCache<T>(
  cacheKey: string,
  fetchFn: () => Promise<T>,
  ttl: number = CACHE_TTL_MS
): Promise<T> {
  // Try to get from cache first
  const cached = await cacheGet(cacheKey);

  if (cached) {
    const age = Date.now() - cached.timestamp;

    if (age < ttl) {
      // Cache is fresh — return it, refresh in background
      fetchFn()
        .then((fresh) => cacheSet(cacheKey, fresh))
        .catch(() => {}); // silent background refresh
      return cached.data as T;
    }
  }

  // Cache miss or expired — fetch fresh data
  const data = await fetchFn();
  await cacheSet(cacheKey, data);
  return data;
}

/**
 * Clear all cached data (useful after data sync/update)
 */
export async function clearCache(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
  } catch {
    // Non-critical
  }
}

/**
 * Get cache stats for debugging
 */
export async function getCacheStats(): Promise<{
  entries: number;
  totalSize: string;
  oldestAge: string;
}> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const entries = req.result as CacheEntry[];
        const now = Date.now();
        let oldest = now;
        let totalChars = 0;

        for (const e of entries) {
          if (e.timestamp < oldest) oldest = e.timestamp;
          totalChars += JSON.stringify(e.data).length;
        }

        const ageMs = entries.length > 0 ? now - oldest : 0;
        const ageMins = Math.round(ageMs / 60000);

        resolve({
          entries: entries.length,
          totalSize: `${Math.round(totalChars / 1024)} KB`,
          oldestAge: `${ageMins} min`,
        });
      };
      req.onerror = () =>
        resolve({ entries: 0, totalSize: "0 KB", oldestAge: "N/A" });
    });
  } catch {
    return { entries: 0, totalSize: "0 KB", oldestAge: "N/A" };
  }
}
