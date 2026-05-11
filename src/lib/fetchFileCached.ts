type CacheEntry = { content: string; timestamp: number };

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_ITEMS    = 2000;
const EVICT_COUNT  = 200;

type GitHubArgs = {
  mode?: "github";
  owner: string;
  repo: string;
  ref: string;
  path: string;
  signal?: AbortSignal;
};

type LocalArgs = {
  mode: "local";
  localPath: string;
  path: string;
  signal?: AbortSignal;
};

export type FetchFileArgs = GitHubArgs | LocalArgs;

function getCacheKey(args: FetchFileArgs): string {
  if (args.mode === "local") return `local:${args.localPath}/${args.path}`;
  return `${args.owner}/${args.repo}/${args.ref}/${args.path}`;
}

function buildFetchUrl(args: FetchFileArgs): string {
  if (args.mode === "local") {
    const url = new URL("/api/local/file", window.location.origin);
    url.searchParams.set("localPath", args.localPath);
    url.searchParams.set("filePath", args.path);
    return url.toString();
  }
  const url = new URL("/api/github/file", window.location.origin);
  url.searchParams.set("owner", args.owner);
  url.searchParams.set("repo", args.repo);
  url.searchParams.set("ref", args.ref);
  url.searchParams.set("path", args.path);
  return url.toString();
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
  });
}

const MAX_RETRIES = 3;

export async function fetchFileCached(args: FetchFileArgs): Promise<string> {
  const key    = getCacheKey(args);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    // Move to end so LRU eviction skips recently accessed entries
    cache.delete(key);
    cache.set(key, cached);
    return cached.content;
  }

  const url = buildFetchUrl(args);
  let lastStatus = 0;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, { signal: args.signal });
    lastStatus = res.status;

    if (res.status === 429) {
      if (attempt === MAX_RETRIES) break;
      // Honour the Retry-After header; fall back to exponential backoff (2s, 4s, 8s)
      const retryAfter = parseInt(res.headers.get("Retry-After") ?? "0", 10);
      const backoff    = retryAfter > 0 ? retryAfter * 1000 : Math.min(2 ** attempt * 2000, 30_000);
      await wait(backoff, args.signal);
      continue;
    }

    if (!res.ok) throw new Error(`Failed to fetch file (${res.status})`);

    const data = (await res.json()) as { content?: string; error?: string };
    if (!data.content) throw new Error(data.error ?? "No content returned");

    cache.set(key, { content: data.content, timestamp: Date.now() });

    if (cache.size > MAX_ITEMS) {
      // Map preserves insertion order; first keys are oldest (LRU eviction)
      let evicted = 0;
      for (const k of cache.keys()) {
        if (evicted++ >= EVICT_COUNT) break;
        cache.delete(k);
      }
    }

    return data.content;
  }

  throw new Error(`GitHub rate limit exceeded after ${MAX_RETRIES} retries (status ${lastStatus})`);
}
