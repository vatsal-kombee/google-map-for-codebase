type CacheEntry = { content: string; timestamp: number };

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_ITEMS = 200;
const EVICT_COUNT = 50;

export async function fetchFileCached(args: {
  owner: string;
  repo: string;
  ref: string;
  path: string;
  signal?: AbortSignal;
}): Promise<string> {
  const key = `${args.owner}/${args.repo}/${args.ref}/${args.path}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.content;

  const url = new URL("/api/github/file", window.location.origin);
  url.searchParams.set("owner", args.owner);
  url.searchParams.set("repo", args.repo);
  url.searchParams.set("ref", args.ref);
  url.searchParams.set("path", args.path);

  const res = await fetch(url.toString(), { signal: args.signal });
  if (!res.ok) throw new Error(`Failed to fetch file (${res.status})`);
  const data = (await res.json()) as { content?: string; error?: string };
  if (!data.content) throw new Error(data.error || "No content returned");

  cache.set(key, { content: data.content, timestamp: Date.now() });

  if (cache.size > MAX_ITEMS) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (let i = 0; i < Math.min(EVICT_COUNT, oldest.length); i++) cache.delete(oldest[i]![0]);
  }

  return data.content;
}

