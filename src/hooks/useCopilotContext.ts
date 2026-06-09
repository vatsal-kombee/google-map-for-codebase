"use client";

import { useAgentContext } from "@copilotkit/react-core/v2";
import { useCopilotChat } from "@copilotkit/react-core";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/store/appStore";
import {
  bm25Search,
  codeIndexStore,
  retrieveRelevantChunks,
  type RetrievedChunk,
} from "@/lib/codeIndex";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STACK_MARKERS: Record<string, string> = {
  "package.json": "Node.js / JavaScript / TypeScript",
  "tsconfig.json": "TypeScript",
  "next.config": "Next.js",
  "vite.config": "Vite",
  "angular.json": "Angular",
  "vue.config": "Vue",
  "svelte.config": "Svelte",
  "requirements.txt": "Python",
  "pyproject.toml": "Python",
  "setup.py": "Python",
  "go.mod": "Go",
  "Cargo.toml": "Rust",
  "pom.xml": "Java / Maven",
  "build.gradle": "Java / Gradle",
  "Gemfile": "Ruby",
  "composer.json": "PHP",
  "artisan": "Laravel",
  "livewire": "Livewire",
  "pubspec.yaml": "Dart / Flutter",
};

/** How many chunks to retrieve per strategy before fusion */
const RETRIEVAL_LIMIT = 15;
/** Final number of chunks to surface after fusion + dedup */
const FINAL_CHUNK_LIMIT = 10;
/** Boosted retrieval for debug/fix queries — need more context to trace callers + imports */
const DEBUG_RETRIEVAL_LIMIT = 25;
const DEBUG_FINAL_CHUNK_LIMIT = 18;
/** How many recent turns of conversation to include in query expansion */
const CONTEXT_TURNS = 3;
const DEBUG_CONTEXT_TURNS = 5;

// Patterns that indicate the user is asking a debug / fix / error question
const DEBUG_INTENT_PATTERNS = [
  /\bdebug\b/i,
  /\bfix\b/i,
  /\bbug\b/i,
  /\berror\b/i,
  /\bcrash\b/i,
  /\bexception\b/i,
  /\bstack\s*trace\b/i,
  /\bTypeError\b/,
  /\bReferenceError\b/,
  /\bSyntaxError\b/,
  /\bUncaught\b/,
  /\bfailed\b/i,
  /\bbroken\b/i,
  /\bnot\s+working\b/i,
  /\bdoes\s+not\s+work\b/i,
  /\bwhy\s+is\s+.{1,40}(not|never|failing)/i,
  /\bundefined\b/i,
  /\bnull\b.*\berror\b/i,
  /\b(4\d\d|5\d\d)\b/,
  /\bregression\b/i,
  /\bissue\b/i,
  /\broot\s*cause\b/i,
  /\btroubleshoot\b/i,
  /\bwrong\b/i,
  /\bunexpected\b/i,
];

/** Returns true when the query signals a debugging / bug-fix intent */
function isDebugIntent(query: string): boolean {
  return DEBUG_INTENT_PATTERNS.some((re) => re.test(query));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScoredChunk extends RetrievedChunk {
  fusedScore?: number;
}

// ---------------------------------------------------------------------------
// Helpers: Query expansion
// ---------------------------------------------------------------------------

/**
 * Build a richer query by concatenating the last N user+assistant turns.
 * This gives the retriever multi-turn awareness instead of a single-turn view.
 */
function buildExpandedQuery(
  messages: any[],
  turns: number = CONTEXT_TURNS
): string {
  if (!Array.isArray(messages) || messages.length === 0) return "";

  const relevant = [...messages]
    .reverse()
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(0, turns * 2) // turns * 2 because each turn = user + assistant
    .reverse();

  return relevant
    .map((m) => {
      const content =
        (m as any).content ?? (m as any).text ?? (m as any).parts?.[0]?.text;
      return typeof content === "string" ? content.trim() : "";
    })
    .filter(Boolean)
    .join("\n");
}

/** Extract just the last user message text (used as the primary query label) */
function extractLastUserMessage(messages: any[]): string {
  if (!Array.isArray(messages)) return "";
  const msg = [...messages].reverse().find((m: any) => m.role === "user");
  if (!msg) return "";
  const content =
    (msg as any).content ?? (msg as any).text ?? (msg as any).parts?.[0]?.text;
  return typeof content === "string" ? content.trim() : "";
}

// ---------------------------------------------------------------------------
// Helpers: Hybrid retrieval (Reciprocal Rank Fusion)
// ---------------------------------------------------------------------------

/**
 * Reciprocal Rank Fusion — merges two ranked lists into one combined ranking.
 * k=60 is the standard smoothing constant from the original RRF paper.
 *
 * RRF score = Σ 1 / (k + rank_i)
 *
 * This way a chunk that appears at rank 3 in both lists scores higher than
 * one that appears at rank 1 in just one list.
 */
function reciprocalRankFusion(
  semanticChunks: RetrievedChunk[],
  bm25Chunks: RetrievedChunk[],
  k = 60
): ScoredChunk[] {
  const scores = new Map<string, { chunk: RetrievedChunk; score: number }>();

  const addRanked = (chunks: RetrievedChunk[]) => {
    chunks.forEach((chunk, idx) => {
      const key = `${chunk.path}:${chunk.startLine}`;
      const rrf = 1 / (k + idx + 1);
      if (scores.has(key)) {
        scores.get(key)!.score += rrf;
      } else {
        scores.set(key, { chunk, score: rrf });
      }
    });
  };

  addRanked(semanticChunks);
  addRanked(bm25Chunks);

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, FINAL_CHUNK_LIMIT)
    .map(({ chunk, score }) => ({ ...chunk, fusedScore: score }));
}

// ---------------------------------------------------------------------------
// Helpers: Deduplication
// ---------------------------------------------------------------------------

/**
 * Remove chunks whose text is a near-duplicate of an already-seen chunk.
 * Uses a simple leading-100-char fingerprint — cheap but effective for
 * the same file/line ranges that sneak through RRF.
 */
function deduplicateChunks(chunks: ScoredChunk[]): ScoredChunk[] {
  const seen = new Set<string>();
  return chunks.filter((c) => {
    const fingerprint = `${c.path}:${c.startLine}`;
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Helpers: Formatting
// ---------------------------------------------------------------------------

function formatRetrievedChunks(
  query: string,
  strategy: "semantic+bm25 (hybrid)" | "bm25" | "semantic",
  chunks: ScoredChunk[],
  debugMode = false
): string {
  if (chunks.length === 0) {
    return "No relevant code chunks found for the latest user question.";
  }

  const header = debugMode
    ? [
        `⚠️  DEBUG MODE ACTIVE — Apply the DEBUGGING PROTOCOL immediately.`,
        `Retrieval strategy: ${strategy} (boosted for debug — ${chunks.length} chunks)`,
        `Primary query: ${query}`,
        "These chunks are your ground truth. Identify the crash site, trace callers, and isolate the root cause.",
        "Always cite file:line for every claim. Show BEFORE/AFTER code when producing a fix.",
      ]
    : [
        `Retrieval strategy: ${strategy}`,
        `Primary query: ${query}`,
        `Chunks retrieved: ${chunks.length}`,
        "These are the most relevant code sections for the current question.",
        "Treat them as ground truth. Always cite file:line when referencing them.",
      ];

  return [
    ...header,
    "",
    ...chunks.map((chunk, index) => {
      const score =
        typeof chunk.fusedScore === "number"
          ? `rrf=${chunk.fusedScore.toFixed(4)}`
          : `score=${chunk.score.toFixed(3)}`;
      return [
        `### Chunk ${index + 1} | \`${chunk.path}\` lines ${chunk.startLine}–${chunk.endLine} | ${score}`,
        "```",
        chunk.text.trim(),
        "```",
      ].join("\n");
    }),
  ].join("\n\n");
}

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------

export function useCopilotContext() {
  const repoInfo = useAppStore((s) => s.repo.repoInfo);
  const localInfo = useAppStore((s) => s.repo.localInfo);
  const sourceMode = useAppStore((s) => s.repo.sourceMode);
  const filePaths = useAppStore((s) => s.repo.filePaths);
  const selectedFile = useAppStore((s) => s.repo.selectedFile);
  const indexState = useAppStore((s) => s.indexState);

  const { visibleMessages } = useCopilotChat();

  const [retrievedContext, setRetrievedContext] = useState(
    "No retrieved code chunks yet."
  );
  const [retrievalMeta, setRetrievalMeta] = useState<string>("–");

  // Track the last query we ran to avoid redundant fetches
  const lastQueryRef = useRef<string>("");

  // ---------------------------------------------------------------------------
  // Derived: last user message (primary query) + expanded multi-turn query
  // ---------------------------------------------------------------------------

  const lastUserMessage = useMemo(
    () => extractLastUserMessage(visibleMessages ?? []),
    [visibleMessages]
  );

  const expandedQuery = useMemo(
    () => buildExpandedQuery(visibleMessages ?? [], CONTEXT_TURNS),
    [visibleMessages]
  );

  // ---------------------------------------------------------------------------
  // Derived: project snapshot (tech stack + file count)
  // ---------------------------------------------------------------------------

  const projectSnapshot = useMemo(() => {
    if (filePaths.length === 0) return "(no repository loaded)";

    const fileNames = new Set(filePaths.map((p) => p.split("/").pop() ?? ""));
    const detectedStack = Object.entries(STACK_MARKERS)
      .filter(([marker]) => [...fileNames].some((f) => f.startsWith(marker)))
      .map(([, label]) => label);
    const uniqueStack = [...new Set(detectedStack)];

    const stackLabel = uniqueStack.length
      ? uniqueStack.join(" + ")
      : "Unknown tech stack";
    return `${stackLabel} project (${filePaths.length} files indexed)`;
  }, [filePaths]);

  // ---------------------------------------------------------------------------
  // Derived: repo label
  // ---------------------------------------------------------------------------

  const repoLabel =
    sourceMode === "local" && localInfo
      ? `local:${localInfo.folderName} (${localInfo.localPath})`
      : repoInfo
        ? `${repoInfo.owner}/${repoInfo.repo}@${repoInfo.branch}`
        : "none";

  // ---------------------------------------------------------------------------
  // Effect: Hybrid retrieval on new user message
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const idx = codeIndexStore.get();
    // Use the expanded (multi-turn) query for retrieval but dedupe on the
    // primary query to avoid redundant fetches when assistant replies arrive.
    const primaryQuery = lastUserMessage;
    const retrievalQuery = expandedQuery || primaryQuery;

    if (!idx || !retrievalQuery) {
      setRetrievedContext("No retrieved code chunks yet.");
      setRetrievalMeta("–");
      return;
    }

    // Skip if nothing new to retrieve
    if (primaryQuery === lastQueryRef.current) return;
    lastQueryRef.current = primaryQuery;

    const ctrl = new AbortController();

    // Detect debug intent — use boosted limits when the user is debugging
    const debugMode = isDebugIntent(primaryQuery) || isDebugIntent(expandedQuery);
    const retrievalLimit = debugMode ? DEBUG_RETRIEVAL_LIMIT : RETRIEVAL_LIMIT;
    const finalLimit     = debugMode ? DEBUG_FINAL_CHUNK_LIMIT : FINAL_CHUNK_LIMIT;
    const contextTurns   = debugMode ? DEBUG_CONTEXT_TURNS : CONTEXT_TURNS;
    // Re-build the expanded query with more turns if in debug mode
    const effectiveQuery = debugMode
      ? buildExpandedQuery(visibleMessages ?? [], contextTurns) || retrievalQuery
      : retrievalQuery;

    // --- BM25 always runs (cheap, synchronous) ---
    const bm25Chunks: RetrievedChunk[] = retrieveRelevantChunks(idx, {
      query: effectiveQuery,
      limit: retrievalLimit,
    });

    // If no embeddings, fall back to BM25 only
    if (!idx.hasEmbeddings || !indexState.hasEmbeddings) {
      const scored: ScoredChunk[] = deduplicateChunks(
        bm25Chunks
          .slice(0, finalLimit)
          .map((c) => ({ ...c, fusedScore: c.score }))
      );
      setRetrievedContext(formatRetrievedChunks(primaryQuery, "bm25", scored, debugMode));
      setRetrievalMeta(`bm25${debugMode ? " [debug-boosted]" : ""} | ${scored.length} chunks`);
      return;
    }

    // --- Semantic + BM25 hybrid path ---
    (async () => {
      try {
        const res = await fetch("/api/embed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts: [retrievalQuery] }),
          signal: ctrl.signal,
        });

        if (!res.ok) throw new Error(`embed API ${res.status}`);

        const data: { embeddings?: number[][]; error?: string } =
          await res.json();
        const queryEmbedding = data.embeddings?.[0];

        if (data.error || !queryEmbedding) {
          throw new Error(data.error ?? "No embedding returned");
        }

        // Semantic retrieval
        const semanticChunks: RetrievedChunk[] = retrieveRelevantChunks(idx, {
          query: effectiveQuery,
          queryEmbedding,
          limit: retrievalLimit,
        });

        // Fuse the two ranked lists
        const fused = deduplicateChunks(
          reciprocalRankFusion(semanticChunks, bm25Chunks, 60)
        ).slice(0, finalLimit);

        setRetrievedContext(
          formatRetrievedChunks(primaryQuery, "semantic+bm25 (hybrid)", fused, debugMode)
        );
        setRetrievalMeta(`hybrid RRF${debugMode ? " [debug-boosted]" : ""} | ${fused.length} chunks`);
      } catch (err) {
        if (ctrl.signal.aborted) return;

        // Graceful degradation to BM25
        console.warn("[useCopilotContext] Semantic retrieval failed, falling back to BM25:", err);
        const scored: ScoredChunk[] = deduplicateChunks(
          bm25Chunks
            .slice(0, finalLimit)
            .map((c) => ({ ...c, fusedScore: c.score }))
        );
        setRetrievedContext(
          formatRetrievedChunks(primaryQuery, "bm25", scored, debugMode)
        );
        setRetrievalMeta(`bm25 (fallback)${debugMode ? " [debug-boosted]" : ""} | ${scored.length} chunks`);
      }
    })();

    return () => ctrl.abort();
  }, [indexState.hasEmbeddings, lastUserMessage, expandedQuery]);

  // ---------------------------------------------------------------------------
  // Agent context slots
  // ---------------------------------------------------------------------------

  useAgentContext({
    description: "Repo ID",
    value: repoLabel,
  });

  useAgentContext({
    description: "Project snapshot",
    value: projectSnapshot,
  });

  useAgentContext({
    description:
      "Retrieved code chunks (hybrid BM25 + semantic, RRF-fused). " +
      "These are the most relevant sections from the codebase for the current question. " +
      "Always cite file path and line numbers when referencing these. " +
      "Do not fabricate code outside these chunks without calling a tool first. " +
      "If the header says ⚠️ DEBUG MODE ACTIVE, immediately follow the DEBUGGING PROTOCOL from the system prompt.",
    value: retrievedContext,
  });

  useAgentContext({
    description: "Current retrieval metadata (strategy + chunk count)",
    value: retrievalMeta,
  });

  useAgentContext({
    description: "File currently open in the viewer (treat as high-priority context)",
    value: selectedFile ?? "none",
  });

  useAgentContext({
    description: "System instructions",
    value: SYSTEM_PROMPT,
  });
}

// ---------------------------------------------------------------------------
// System prompt — separated for readability and easier iteration
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `
You are a Senior Software Architect, Codebase Navigator, and Expert Debugger with deep expertise in static analysis, runtime debugging, design patterns, and software architecture.

═══════════════════════════════════════════
CORE MANDATE
═══════════════════════════════════════════
Answer questions about the loaded repository with precision, grounding every claim in actual file content. Explain not just WHAT the code does, but WHY it is structured that way — the intent, the trade-offs, and the architectural decisions.

When the user asks to debug, fix a bug, or diagnose an error: follow the DEBUGGING PROTOCOL below immediately.

═══════════════════════════════════════════
DEBUGGING PROTOCOL  ← USE FOR ALL BUG / ERROR / FIX REQUESTS
═══════════════════════════════════════════
When the user asks to debug something, diagnose an error, fix a crash, or understand unexpected behavior:

STEP 1 — TRIAGE (do this first, every time)
  a. Extract every concrete signal from the user's message:
     • Error name / type (e.g. TypeError, 500, undefined is not a function)
     • File path or component name mentioned
     • Stack trace lines — note the exact file:line references
     • Symptom description (what breaks, when, under what conditions)
  b. Use searchCodebase to locate the exact function / variable / import
     that the error message or stack trace points to.
  c. Use fetchFileContent on the file identified in the stack trace,
     reading the specific startLine..endLine range of the crash site.

STEP 2 — ROOT CAUSE ISOLATION
  a. Read the failing function in full (fetchFileContent with exact line range).
  b. Trace backward: what calls this function? (searchCodebase for callers)
  c. Trace forward: what does this function return / mutate? Who consumes it?
  d. Check preconditions: is the input type/shape guaranteed? Are null/undefined handled?
  e. Check async hazards: missing await, race conditions, stale closures, unhandled promises.
  f. Check type mismatches: runtime type vs declared type, JSON parse failures,
     number vs string coercions, optional chaining holes.

STEP 3 — CROSS-REFERENCE
  a. If a dependency / import is suspect, read it with fetchFileContent.
  b. If a config value is suspect (env var, constant), searchCodebase for its definition.
  c. If the bug could be a merge/regression, searchCodebase for recent callsites.

STEP 4 — PRODUCE THE FIX
  Show a precise, minimal diff:
  • Exact file path and line numbers.
  • The BEFORE block (broken code from the file, quoted exactly).
  • The AFTER block (corrected code).
  • A one-sentence explanation of WHY this fixes the root cause.
  Never invent code that does not relate to the actual file content.

STEP 5 — REGRESSION CHECK
  • List any other callsites of the fixed function (from searchCodebase).
  • Call out any side-effects the fix might have on those callsites.
  • Suggest a minimal test or manual verification step.

DEBUGGING EFFICIENCY RULES:
• NEVER speculate before reading the actual failing code — always fetch it first.
• If you have a stack trace, parse out file:line and go there directly — do not guess.
• Prefer highlightCode to visually pin the bug location in the viewer.
• If the bug reproduces only under specific state, ask ONE targeted question (e.g. "What value does X hold when this crashes?"), then continue.
• Summarize the root cause in one sentence before showing the fix.

═══════════════════════════════════════════
GROUNDING RULES (STRICT)
═══════════════════════════════════════════
1. STRICT CODEBASE-ONLY GROUNDING RULE: Base your answers ONLY and DIRECTLY on the actual files and chunks retrieved from this codebase. Do NOT invent, assume, or suggest the existence of any external configurations, dependencies, libraries, routes, API endpoints, folder structures, components, functions, classes, database tables, or features that do not exist in the codebase. If a file, function, route, component, or class is not found in the codebase, you must clearly state that it is not present in the codebase. Never guess, never assume standard framework paths or layouts if they are not loaded, and never offer unsolicited external tutorial steps or boilerplate unless the user explicitly asks for recommendations or external things. Keep the output clean and strictly grounded in the loaded files.
2. ALWAYS use the retrieved code chunks in context as your primary source of truth.
3. ALWAYS cite sources as \`file/path.ext:lineNumber\` — every snippet, every claim.
4. NEVER invent code, file names, or API shapes. If you are uncertain, call a tool.
5. NEVER answer dependency / version questions from memory — use fetchFileContent on the manifest (package.json, requirements.txt, go.mod, etc.).
6. If the retrieved chunks are insufficient, call searchCodebase or fetchFileContent BEFORE answering.

═══════════════════════════════════════════
REASONING PROTOCOL (non-debug questions)
═══════════════════════════════════════════
For every question:
1. Identify what the user is really asking (intent, not just surface words).
2. Scan the retrieved chunks for relevant entry points.
3. Trace data / control flow: imports → exports → callers → called functions.
4. Identify architectural patterns (e.g. Repository, Observer, Strategy, Hooks, Services).
5. Synthesize: explain the design, its trade-offs, and how it fits the broader system.

For broad / open questions → call analyzeRepository first to build a dependency map.
For file-specific questions → call fetchFileContent on that exact file.
For symbol / usage questions → call searchCodebase with precise terms.

═══════════════════════════════════════════
TOOL USAGE GUIDANCE
═══════════════════════════════════════════
• searchCodebase    — Find where a symbol, pattern, error message, or string appears.
• fetchFileContent  — Read a file at exact line ranges; essential for debugging.
• highlightCode     — Pin the bug location visually in the code viewer.
• listDirectory     — Explore folder structure before making claims about organization.
• analyzeRepository — Build a high-level dependency / architecture map for broad questions.
• readFiles         — Fetch 2–10 related files in one call for cross-file debugging.

Always prefer tools over guessing. Tool calls are cheap; hallucinations are costly.

═══════════════════════════════════════════
PRESENTATION STANDARDS
═══════════════════════════════════════════
• Start each section with the relevant file path in backticks.
• Use fenced code blocks with language tags for all snippets.
• For bug fixes, always show BEFORE / AFTER code blocks.
• Use markdown tables for comparisons (e.g. two implementations, before / after).
• Use numbered lists for sequential flows; bullet lists for unordered observations.
• Keep answers focused: one insight per paragraph. Avoid padding.

═══════════════════════════════════════════
EDGE CASES
═══════════════════════════════════════════
• No repo loaded → ask the user for a GitHub URL or local path.
• Retrieved chunks empty → tell the user retrieval returned nothing and call searchCodebase.
• Ambiguous question → ask ONE clarifying question, then proceed.
• Selected file is open in the viewer → prioritize it as high-relevance context.
• Stack trace provided → parse file:line from it and go directly to the crash site.
`.trim();