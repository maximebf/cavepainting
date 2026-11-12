// Offline-first: the loading screen (not the service worker) downloads the game into
// Cache Storage, using dist/precache.json written at build time.

export const CACHE_NAME = 'cavepainting-v1';
const META_URL = '__precache-meta__';
const PARALLEL = 6;
const RETRIES = 3;

interface PrecacheFile {
  url: string;
  hash: string;
  size: number;
}
interface PrecacheList {
  version: string;
  files: PrecacheFile[];
}

export type Progress = (loaded: number, total: number) => void;

function abs(url: string): string {
  return new URL(url, document.baseURI).href;
}

async function fetchRetry(url: string): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < RETRIES; i++) {
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (r.ok) return r;
      lastErr = new Error(`${r.status} ${url}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise((res) => setTimeout(res, 300 * (i + 1)));
  }
  throw lastErr;
}

/** Downloads missing or changed files. Resolves true when everything is cached. */
export async function syncPrecache(onProgress: Progress): Promise<boolean> {
  if (import.meta.env.DEV || !('caches' in window)) {
    onProgress(1, 1);
    return true;
  }
  const list = (await (await fetchRetry('precache.json')).json()) as PrecacheList;
  const cache = await caches.open(CACHE_NAME);
  const metaRes = await cache.match(abs(META_URL));
  const known: Record<string, string> = metaRes ? await metaRes.json() : {};

  const isIndex = (u: string) => u === 'index.html';
  const todo = list.files.filter((f) => known[f.url] !== f.hash);
  const total = todo.reduce((s, f) => s + f.size, 0) || 1;
  let loaded = 0;
  onProgress(0, total);

  const fetchOne = async (f: PrecacheFile) => {
    const r = await fetchRetry(f.url);
    await cache.put(abs(f.url), r);
    known[f.url] = f.hash;
    loaded += f.size;
    onProgress(loaded, total);
  };

  // index.html goes last, so a half-finished update never pairs new HTML with old scripts.
  const queue = todo.filter((f) => !isIndex(f.url));
  let failed = false;
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        await fetchOne(f).catch(() => (failed = true));
      }
    }),
  );
  if (!failed) {
    for (const f of todo.filter((f) => isIndex(f.url))) await fetchOne(f).catch(() => (failed = true));
  }

  // Drop files that are no longer part of the game.
  const wanted = new Set(list.files.map((f) => abs(f.url)));
  for (const req of await cache.keys()) {
    if (req.url !== abs(META_URL) && !wanted.has(req.url)) await cache.delete(req);
  }
  for (const k of Object.keys(known)) if (!wanted.has(abs(k))) delete known[k];
  await cache.put(abs(META_URL), new Response(JSON.stringify(known), { headers: { 'content-type': 'application/json' } }));
  onProgress(total, total);
  return !failed;
}

export function registerServiceWorker(): void {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
