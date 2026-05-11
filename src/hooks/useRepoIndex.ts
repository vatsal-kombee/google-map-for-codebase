"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/appStore";
import { fetchFileCached } from "@/lib/fetchFileCached";
import { shouldIndexFile, chunkFile } from "@/lib/chunker";
import { buildCodeIndex, codeIndexStore, type IndexedChunk } from "@/lib/codeIndex";
import { createLimiter } from "@/lib/concurrency";
import { languageAdapters } from "@/lib/analyzers";

const MAX_INDEX_FILES        = 5000; // significantly increased for better coverage
const FETCH_CONCURRENCY_LOCAL  = 40;   // local FS: high concurrency
const FETCH_CONCURRENCY_GITHUB = 15;   // GitHub API: slightly more aggressive but still safe
const EMBED_BATCH_SIZE         = 100;  // larger batches
const EMBED_CONCURRENCY        = 5;    // parallel embedding batches

async function fetchEmbeddings(texts: string[], signal: AbortSignal): Promise<number[][] | null> {
  try {
    const res = await fetch("/api/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts }),
      signal,
    });
    if (!res.ok) return null;
    const data: { embeddings?: number[][]; error?: string } = await res.json();
    if (data.error || !Array.isArray(data.embeddings)) return null;
    return data.embeddings;
  } catch {
    return null;
  }
}

export function useRepoIndex() {
  const filePaths     = useAppStore((s) => s.repo.filePaths);
  const repoInfo      = useAppStore((s) => s.repo.repoInfo);
  const localInfo     = useAppStore((s) => s.repo.localInfo);
  const sourceMode    = useAppStore((s) => s.repo.sourceMode);
  const setIndexState = useAppStore((s) => s.actions.setIndexState);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Repo unloaded — clear everything
    if (filePaths.length === 0) {
      codeIndexStore.clear();
      setIndexState({ status: "idle", progress: 0, total: 0, chunkCount: 0, hasEmbeddings: false, error: null });
      return;
    }

    // Cancel any in-progress build
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const { signal } = ctrl;

    const targets = filePaths.filter(shouldIndexFile).slice(0, MAX_INDEX_FILES);
    setIndexState({ status: "building", progress: 0, total: targets.length, chunkCount: 0, hasEmbeddings: false, error: null });

    const buildArgs = (path: string) => {
      if (sourceMode === "local" && localInfo)
        return { mode: "local" as const, localPath: localInfo.localPath, path, signal };
      if (!repoInfo) throw new Error("No repository loaded.");
      return { owner: repoInfo.owner, repo: repoInfo.repo, ref: repoInfo.branch, path, signal };
    };

    (async () => {
      // ── Phase 1: Fetch all files in parallel and chunk them ──────────────
      const concurrency = sourceMode === "local" ? FETCH_CONCURRENCY_LOCAL : FETCH_CONCURRENCY_GITHUB;
      const fetchLimit  = createLimiter(concurrency);
      const chunks: IndexedChunk[] = [];
      let done = 0;

      await Promise.all(
        targets.map((path) =>
          fetchLimit(async () => {
            if (signal.aborted) return;
            try {
              const content = await fetchFileCached(buildArgs(path));
              if (content && !signal.aborted) {
                const adapter = languageAdapters.find(a => a.canAnalyzePath(path));
                const symbols = adapter?.extractSymbols ? adapter.extractSymbols(content) : [];
                chunks.push(...chunkFile(path, content, symbols));
              }
            } catch { /* skip unreachable files */ }
            done++;
            // Report progress every 5 files to limit re-renders
            if (done % 5 === 0 || done === targets.length) {
              setIndexState({ progress: done });
            }
          })
        )
      );

      if (signal.aborted) return;
      setIndexState({ chunkCount: chunks.length });

      // ── Phase 2: Embeddings — optional, best-effort ───────────────────────
      // Probe with first batch; if the API is unavailable, skip silently.
      let embeddingsWorking = false;

      if (chunks.length > 0) {
        const probe = chunks.slice(0, Math.min(EMBED_BATCH_SIZE, chunks.length));
        const probeResult = await fetchEmbeddings(probe.map((c) => c.text), signal);

        if (probeResult && !signal.aborted) {
          embeddingsWorking = true;
          probeResult.forEach((emb, i) => { probe[i].embedding = emb; });
        }
      }

      if (embeddingsWorking && chunks.length > EMBED_BATCH_SIZE && !signal.aborted) {
        const remaining: IndexedChunk[][] = [];
        for (let i = EMBED_BATCH_SIZE; i < chunks.length; i += EMBED_BATCH_SIZE) {
          remaining.push(chunks.slice(i, i + EMBED_BATCH_SIZE));
        }

        const embLimit = createLimiter(EMBED_CONCURRENCY);
        await Promise.all(
          remaining.map((batch) =>
            embLimit(async () => {
              if (signal.aborted) return;
              const embs = await fetchEmbeddings(batch.map((c) => c.text), signal);
              if (embs && !signal.aborted) {
                embs.forEach((emb, i) => { batch[i].embedding = emb; });
              }
            })
          )
        );
      }

      if (signal.aborted) return;

      // ── Phase 3: Build and store the final index ──────────────────────────
      const index = buildCodeIndex(chunks);
      codeIndexStore.set(index);

      setIndexState({
        status: "ready",
        chunkCount: chunks.length,
        hasEmbeddings: index.hasEmbeddings,
        error: null,
      });
    })().catch((err) => {
      if (!signal.aborted) {
        setIndexState({ status: "error", error: err instanceof Error ? err.message : "Indexing failed" });
      }
    });

    return () => { ctrl.abort(); };
  }, [filePaths, repoInfo, localInfo, sourceMode, setIndexState]);
}
