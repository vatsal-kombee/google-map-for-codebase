import type { FileChunk } from "./chunker";

// BM25 tuning constants
const K1 = 1.5; // term-frequency saturation
const B  = 0.75; // length normalisation

export type IndexedChunk = FileChunk & { embedding?: number[] };

export type CodeIndex = {
  chunks: IndexedChunk[];
  postings: Map<string, Array<{ id: number; tf: number }>>;
  docLengths: number[];
  avgdl: number;
  N: number;
  hasEmbeddings: boolean;
};

export type SearchHit = {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
};

export type RetrievedChunk = {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  text: string;
  strategy: "semantic" | "bm25";
};

// Module-level singleton — keeps the large index object out of React state
// to avoid serialisation overhead and unnecessary re-renders.
let _index: CodeIndex | null = null;

export const codeIndexStore = {
  get: (): CodeIndex | null => _index,
  set: (idx: CodeIndex): void => { _index = idx; },
  clear: (): void => { _index = null; },
};

// ---------------------------------------------------------------------------
// Tokenisation
// ---------------------------------------------------------------------------

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-zA-Z0-9_$]+/)
    .filter((t) => t.length > 1 && t.length < 40);
}

// ---------------------------------------------------------------------------
// Index construction
// ---------------------------------------------------------------------------

export function buildCodeIndex(chunks: IndexedChunk[]): CodeIndex {
  const postings = new Map<string, Array<{ id: number; tf: number }>>();
  const docLengths: number[] = new Array(chunks.length).fill(0);
  let totalLength = 0;

  for (let id = 0; id < chunks.length; id++) {
    const tokens = tokenize(chunks[id].text);
    docLengths[id] = tokens.length;
    totalLength += tokens.length;

    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);

    for (const [term, count] of tf) {
      if (!postings.has(term)) postings.set(term, []);
      postings.get(term)!.push({ id, tf: count });
    }
  }

  return {
    chunks,
    postings,
    docLengths,
    avgdl: chunks.length > 0 ? totalLength / chunks.length : 0,
    N: chunks.length,
    hasEmbeddings: chunks.some((c) => !!c.embedding),
  };
}

// ---------------------------------------------------------------------------
// BM25 keyword search
// ---------------------------------------------------------------------------

export function bm25Search(index: CodeIndex, query: string, limit = 15): SearchHit[] {
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0) return [];

  const scores = new Map<number, number>();

  for (const term of queryTokens) {
    const entries = index.postings.get(term);
    if (!entries) continue;

    const df  = entries.length;
    const idf = Math.log((index.N - df + 0.5) / (df + 0.5) + 1);

    for (const { id, tf } of entries) {
      const dl   = index.docLengths[id];
      const norm = K1 * (1 - B + B * (dl / index.avgdl));
      let score = idf * ((tf * (K1 + 1)) / (tf + norm));

      // Complexity-aware retrieval (Step 5 logic)
      // Boost score slightly for chunks that represent substantial code blocks
      const chunk = index.chunks[id];
      if (chunk.symbolType === "class" || chunk.symbolType === "struct") {
        score *= 1.1; // 10% boost for high-level definitions
      } else if (chunk.symbolType === "component") {
        score *= 1.12; // 12% boost for UI components — often the most relevant unit
      } else if (chunk.symbolType === "function" || chunk.symbolType === "method") {
        score *= 1.05; // 5% boost for functions
      } else if (chunk.symbolType === "route") {
        score *= 1.08; // 8% boost for route handlers
      } else if (chunk.symbolType === "interface") {
        score *= 1.03; // 3% boost for interfaces/types
      }
      
      if (chunk.complexity && chunk.complexity > 3) {
        // Logarithmic boost based on complexity to favor more substantive logic
        // but capping it so it doesn't overpower keyword relevance
        score *= (1 + (Math.log10(chunk.complexity) * 0.1));
      }

      scores.set(id, (scores.get(id) ?? 0) + score);
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, score]) => {
      const chunk = index.chunks[id];
      const lines = chunk.text.split("\n");
      // Pick the first line that contains a query token as the snippet
      const snippet =
        lines.find((l) => tokenize(l).some((t) => queryTokens.includes(t))) ??
        lines[0] ??
        "";
      return {
        path: chunk.path,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        score,
        snippet: snippet.trim().slice(0, 200),
      };
    });
}

// ---------------------------------------------------------------------------
// Semantic (embedding) search
// ---------------------------------------------------------------------------

function cosine(a: number[], b: number[]): number {
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    ma  += a[i] * a[i];
    mb  += b[i] * b[i];
  }
  return ma && mb ? dot / (Math.sqrt(ma) * Math.sqrt(mb)) : 0;
}

export function semanticSearch(
  index: CodeIndex,
  queryEmbedding: number[],
  limit = 10
): SearchHit[] {
  return index.chunks
    .filter((c) => !!c.embedding)
    .map((c) => ({
      path: c.path,
      startLine: c.startLine,
      endLine: c.endLine,
      score: cosine(queryEmbedding, c.embedding!),
      snippet: c.text.split("\n")[0]?.trim().slice(0, 200) ?? "",
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Build a path+line lookup Map once per index to avoid O(n) find() on each hit
function buildChunkLookup(chunks: IndexedChunk[]): Map<string, IndexedChunk> {
  const m = new Map<string, IndexedChunk>();
  for (const c of chunks) m.set(`${c.path}:${c.startLine}`, c);
  return m;
}

// Cached lookup — invalidated when the index reference changes
let _lookupIndex: CodeIndex | null = null;
let _lookup: Map<string, IndexedChunk> | null = null;
function getChunkLookup(index: CodeIndex): Map<string, IndexedChunk> {
  if (_lookupIndex !== index) { _lookupIndex = index; _lookup = buildChunkLookup(index.chunks); }
  return _lookup!;
}

export function retrieveRelevantChunks(
  index: CodeIndex,
  options: {
    query: string;
    limit?: number;
    queryEmbedding?: number[];
  }
): RetrievedChunk[] {
  const limit = options.limit ?? 5;

  if (options.queryEmbedding && index.hasEmbeddings) {
    // Hybrid: BM25 top-200 candidates → cosine re-rank → top limit
    // Avoids O(n) full embedding scan for large indices
    const BM25_CANDIDATES = 200;
    const bm25Hits = bm25Search(index, options.query, BM25_CANDIDATES);
    const lookup = getChunkLookup(index);

    const reranked: RetrievedChunk[] = [];
    for (const hit of bm25Hits) {
      const chunk = lookup.get(`${hit.path}:${hit.startLine}`);
      if (!chunk?.embedding) continue;
      reranked.push({
        path: chunk.path,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        score: cosine(options.queryEmbedding!, chunk.embedding),
        text: chunk.text,
        strategy: "semantic",
      });
    }
    reranked.sort((a, b) => b.score - a.score);
    reranked.splice(limit);

    // If BM25 returned few embedding-bearing chunks, fall back to scanning remainder
    if (reranked.length < limit) {
      const seen = new Set(reranked.map((r) => `${r.path}:${r.startLine}`));
      const extra: RetrievedChunk[] = index.chunks
        .filter((c) => !!c.embedding && !seen.has(`${c.path}:${c.startLine}`))
        .map((c) => ({
          path: c.path,
          startLine: c.startLine,
          endLine: c.endLine,
          score: cosine(options.queryEmbedding!, c.embedding!),
          text: c.text,
          strategy: "semantic" as const,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit - reranked.length);
      reranked.push(...extra);
    }

    return reranked;
  }

  const lexicalHits = bm25Search(index, options.query, limit);
  const lookup = getChunkLookup(index);
  return lexicalHits.map((hit) => {
    const chunk = lookup.get(`${hit.path}:${hit.startLine}`);
    return {
      path: hit.path,
      startLine: hit.startLine,
      endLine: hit.endLine,
      score: hit.score,
      text: chunk?.text ?? hit.snippet,
      strategy: "bm25" as const,
    };
  });
}
