"use client";

import { useAgentContext } from "@copilotkit/react-core/v2";
import { useCopilotChat } from "@copilotkit/react-core";
import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store/appStore";
import {
  bm25Search,
  codeIndexStore,
  retrieveRelevantChunks,
  type RetrievedChunk,
} from "@/lib/codeIndex";

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

function formatRetrievedChunks(
  query: string,
  strategy: "semantic" | "bm25",
  chunks: RetrievedChunk[]
): string {
  if (chunks.length === 0) {
    return "No relevant code chunks found for the latest user question.";
  }

  return [
    `Retrieval mode: ${strategy}`,
    `Query: ${query}`,
    "Use only these retrieved chunks as the default repository context for this turn.",
    "",
    ...chunks.map(
      (chunk, index) =>
        [
          `Chunk ${index + 1} | ${chunk.path}:${chunk.startLine}-${chunk.endLine} | score=${chunk.score.toFixed(3)}`,
          chunk.text,
        ].join("\n")
    ),
  ].join("\n\n---\n\n");
}

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

  const lastUserMessage = useMemo(() => {
    if (!visibleMessages || !Array.isArray(visibleMessages)) return "";
    const msg = [...visibleMessages].reverse().find((m: any) => m.role === "user");
    if (!msg) return "";
    const content = (msg as any).content ?? (msg as any).text ?? (msg as any).parts?.[0]?.text;
    return typeof content === "string" ? content : "";
  }, [visibleMessages]);

  // File list removed to save context tokens. Use listDirectory or searchCodebase tools instead.

  const projectSnapshot = useMemo(() => {
    if (filePaths.length === 0) return "(no repository loaded)";

    const fileNames = new Set(filePaths.map((p) => p.split("/").pop() ?? ""));
    const detectedStack = Object.entries(STACK_MARKERS)
      .filter(([marker]) => [...fileNames].some((f) => f.startsWith(marker)))
      .map(([, label]) => label);
    const uniqueStack = [...new Set(detectedStack)];

    const stackLabel = uniqueStack.length ? uniqueStack.join(" + ") : "Unknown tech stack";
    return `${stackLabel} project (${filePaths.length} files)`;
  }, [filePaths]);

  const repoLabel =
    sourceMode === "local" && localInfo
      ? `local:${localInfo.folderName} (${localInfo.localPath})`
      : repoInfo
        ? `${repoInfo.owner}/${repoInfo.repo}@${repoInfo.branch}`
        : "none";

  useEffect(() => {
    const idx = codeIndexStore.get();
    const query = lastUserMessage.trim();

    if (!idx || !query) {
      setRetrievedContext("No retrieved code chunks yet.");
      return;
    }

    const ctrl = new AbortController();

    if (!idx.hasEmbeddings || !indexState.hasEmbeddings) {
      const chunks = retrieveRelevantChunks(idx, { query, limit: 10 });
      setRetrievedContext(formatRetrievedChunks(query, "bm25", chunks));
      return () => ctrl.abort();
    }

    (async () => {
      try {
        const res = await fetch("/api/embed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts: [query] }),
          signal: ctrl.signal,
        });

        if (!res.ok) {
          const fallback = retrieveRelevantChunks(idx, { query, limit: 10 });
          setRetrievedContext(formatRetrievedChunks(query, "bm25", fallback));
          return;
        }

        const data: { embeddings?: number[][]; error?: string } = await res.json();
        const queryEmbedding = data.embeddings?.[0];

        if (data.error || !queryEmbedding) {
          const fallback = retrieveRelevantChunks(idx, { query, limit: 10 });
          setRetrievedContext(formatRetrievedChunks(query, "bm25", fallback));
          return;
        }

        const chunks = retrieveRelevantChunks(idx, {
          query,
          queryEmbedding,
          limit: 10,
        });
        setRetrievedContext(formatRetrievedChunks(query, "semantic", chunks));
      } catch {
        if (ctrl.signal.aborted) return;
        const fallback = retrieveRelevantChunks(idx, { query, limit: 10 });
        setRetrievedContext(formatRetrievedChunks(query, "bm25", fallback));
      }
    })();

    return () => ctrl.abort();
  }, [indexState.hasEmbeddings, lastUserMessage]);

  useAgentContext({
    description: "Repo ID",
    value: repoLabel
  });

  useAgentContext({
    description: "Project snapshot",
    value: projectSnapshot
  });

  useAgentContext({
    description: "Top 5 code chunks retrieved for the latest question. Use as default context before calling tools.",
    value: retrievedContext
  });

  useAgentContext({
    description: "Selected file (open in viewer)",
    value: selectedFile ?? "none"
  });

  useAgentContext({
    description: "System instructions",
    value: [
      "You are a Senior Software Architect and Codebase Navigator.",
      "GOAL: Provide deep, structural, and tactical insights. Do not just summarize; explain WHY code is written this way.",
      "HARD RULE: Grounding: Use ONLY files from this repo. Cite file:line for every snippet. Quote verbatim.",
      "REASONING: When asked a question, first trace the flow of data or control. Identify patterns (e.g. MVC, Hooks, Services).",
      "PROACTIVE: If a question is broad, call analyzeRepository to build a dependency map. Use listDirectory to see folder context.",
      "ACCURACY: If you are unsure, call searchCodebase or fetchFileContent. Never guess.",
      "DEPENDENCIES: For any question about package versions or dependencies, you MUST read the manifest files (e.g., package.json, composer.json, requirements.txt) using fetchFileContent. NEVER answer from memory.",
      "PRESENTATION: Use markdown tables for comparisons and clean code blocks for snippets. Cite file paths at the start of every section.",
      "If no repo is loaded, ask for a URL or path."
    ].join("\n")
  });
}
