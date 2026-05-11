"use client";

import { useCallback } from "react";
import { z } from "zod";
import { useFrontendTool } from "@copilotkit/react-core/v2";
import { useAppStore } from "@/store/appStore";
import { fetchFileCached, type FetchFileArgs } from "@/lib/fetchFileCached";
import { findFilesByQuery } from "@/lib/findFilesByQuery";
import { searchContent } from "@/lib/searchContent";
import { buildDependencyGraph } from "@/lib/graph";
import { languageAdapters } from "@/lib/analyzers";
import { codeIndexStore, bm25Search, semanticSearch as semanticSearchFn } from "@/lib/codeIndex";

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function useCopilotTools() {
  const repoInfo = useAppStore((s) => s.repo.repoInfo);
  const localInfo = useAppStore((s) => s.repo.localInfo);
  const sourceMode = useAppStore((s) => s.repo.sourceMode);
  const filePaths = useAppStore((s) => s.repo.filePaths);
  const selectedFile = useAppStore((s) => s.repo.selectedFile);
  const setAnalysis = useAppStore((s) => s.actions.setAnalysis);
  const setVisualization = useAppStore((s) => s.actions.setVisualization);
  const setCodeViewer = useAppStore((s) => s.actions.setCodeViewer);
  const setToolActivity = useAppStore((s) => s.actions.setToolActivity);

  const buildFetchArgs = useCallback(
    (path: string, signal?: AbortSignal): FetchFileArgs => {
      if (sourceMode === "local" && localInfo) {
        return { mode: "local", localPath: localInfo.localPath, path, signal };
      }
      if (!repoInfo) throw new Error("No repository loaded.");
      return { owner: repoInfo.owner, repo: repoInfo.repo, ref: repoInfo.branch, path, signal };
    },
    [sourceMode, localInfo, repoInfo]
  );

  const isLoaded = sourceMode === "local" ? !!localInfo : !!repoInfo;

  useFrontendTool(
    {
      name: "getProjectInfo",
      description: "Get project metadata: file count, file types, languages detected, full directory structure. Use first for any overview or architecture question.",
      available: true,
      parameters: z.object({}),
      handler: async () => {
        if (!isLoaded) return "No repository loaded.";

        const totalFiles = filePaths.length;

        const extCounts = new Map<string, number>();
        for (const p of filePaths) {
          const dot = p.lastIndexOf(".");
          const ext = dot !== -1 ? p.slice(dot + 1).toLowerCase() : "no-ext";
          extCounts.set(ext, (extCounts.get(ext) ?? 0) + 1);
        }
        const topExts = [...extCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([ext, count]) => `${ext} (${count})`)
          .join(", ");

        const dirDepth2 = new Set<string>();
        const dirDepth3 = new Set<string>();
        for (const p of filePaths) {
          const parts = p.split("/");
          if (parts.length >= 2) dirDepth2.add(parts.slice(0, 2).join("/"));
          if (parts.length >= 3) dirDepth3.add(parts.slice(0, 3).join("/"));
        }
        const topDirs = [...new Set(filePaths.map(p => p.split("/")[0]))].sort();
        const dirStructure = [
          ...new Set([...dirDepth2, ...dirDepth3])
        ].sort().slice(0, 80).join("\n");

        const label =
          sourceMode === "local" && localInfo
            ? `Local project: ${localInfo.folderName} (${localInfo.localPath})`
            : repoInfo
            ? `GitHub: ${repoInfo.owner}/${repoInfo.repo} @ branch ${repoInfo.branch}`
            : "Unknown";

        return [
          `Project: ${label}`,
          `Total files: ${totalFiles}`,
          `File types: ${topExts}`,
          `Top-level directories: ${topDirs.join(", ")}`,
          `Directory structure:\n${dirStructure}`
        ].join("\n");
      }
    },
    [isLoaded, filePaths, sourceMode, localInfo, repoInfo]
  );

  useFrontendTool(
    {
      name: "analyzeRepository",
      description: "Perform a deep structural analysis of the codebase. Use this for broad, architectural questions (e.g. 'How is state managed?') where you don't know which files are involved. It will find candidates, map their imports, and generate a dependency visualization. This is the most powerful tool for initial exploration.",
      available: true,
      parameters: z.object({
        query: z.string().describe("The user's question verbatim to guide the discovery."),
        explanation: z.string().describe("Your hypothesis: what are you looking for and why?")
      }),
      handler: async ({ query, explanation }, ctx) => {
        if (!isLoaded) return "No repository loaded.";

        setAnalysis({ loading: true, error: null, result: null });
        setToolActivity("Scanning repository — finding relevant files…");

        try {
          const lowerQuery = query.toLowerCase();
          const fileScopedQuery =
            Boolean(selectedFile) &&
            /(highlight|line|lines|this file|selected file|in this file|in selected file)/i.test(lowerQuery);

          if (fileScopedQuery && selectedFile) {
            const content = await fetchFileCached(buildFetchArgs(selectedFile, ctx?.signal));
            setCodeViewer(selectedFile, content);
            setAnalysis({
              loading: false,
              error: null,
              result: { explanation, relevantFiles: [selectedFile] }
            });
            return `Focused on selected file: ${selectedFile}.`;
          }

          const idx = codeIndexStore.get();
          let relevantFiles: string[] = [];

          if (idx) {
            setToolActivity("Using semantic index to find relevant files…");
            const hits = bm25Search(idx, query, 30);
            relevantFiles = [...new Set(hits.map(h => h.path))];
          }

          if (relevantFiles.length < 15) {
            const pathMatches = findFilesByQuery(filePaths, query, 30);
            relevantFiles = [...new Set([...relevantFiles, ...pathMatches])];
          }

          const prioritizedFiles = selectedFile
            ? [selectedFile, ...relevantFiles.filter((p) => p !== selectedFile)].slice(0, 30)
            : relevantFiles.slice(0, 30);
          const filePathSet = new Set(filePaths);

          const fileToAdapter = new Map<string, (typeof languageAdapters)[number]>();
          for (const p of prioritizedFiles) {
            const adapter = languageAdapters.find((a) => a.canAnalyzePath(p));
            if (adapter) fileToAdapter.set(p, adapter);
          }

          setToolActivity(`Reading ${[...fileToAdapter.keys()].length} file(s)…`);
          const analyzed = await Promise.all(
            [...fileToAdapter.entries()].map(async ([path, adapter]) => {
              const content = await withTimeout(
                fetchFileCached(buildFetchArgs(path, ctx?.signal)),
                8000,
                ""
              );
              return { path, content, imports: adapter.extractImports(content) };
            })
          );

          setToolActivity("Mapping dependencies…");
          const graph = buildDependencyGraph({
            files: analyzed,
            resolveImport: (importPath, fromFile) => {
              const adapter = fileToAdapter.get(fromFile) ?? languageAdapters.find((a) => a.canAnalyzePath(fromFile));
              if (!adapter) return null;
              return adapter.resolveImport({ importPath, fromFile, filePathSet });
            }
          });

          setAnalysis({
            loading: false,
            error: null,
            result: { explanation, relevantFiles: analyzed.map((f) => f.path) }
          });
          if (graph.nodes.length > 0) {
            setVisualization(graph.nodes, graph.edges, "dependency");
          }

          if (analyzed[0]?.path && analyzed[0].content) {
            setCodeViewer(analyzed[0].path, analyzed[0].content);
          }

          setToolActivity(null);
          const fileReports = analyzed.map(f => `--- ${f.path} ---\n${f.content.slice(0, 8000)}${f.content.length > 8000 ? "\n[truncated — use fetchFileContent to read more]" : ""}`).join("\n\n");
          return `Analyzed ${analyzed.length} file(s).\n\nCODE CONTENT:\n${fileReports}`;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          setAnalysis({ loading: false, error: msg });
          setToolActivity(null);
          return `Analysis failed: ${msg}`;
        }
      }
    },
    [isLoaded, buildFetchArgs, filePaths, selectedFile, setAnalysis, setVisualization, setCodeViewer]
  );

  useFrontendTool(
    {
      name: "fetchFileContent",
      description: "Read the source code of a specific file. USE THIS ONLY when you have an exact file path from listDirectory or search results. It reads 500 lines at a time. If you need to read a specific part of a large file, use startLine and endLine.",
      available: true,
      parameters: z.object({
        filePath: z.string().describe("The full path to the file (e.g. 'src/lib/utils.ts')"),
        startLine: z.number().optional().describe("Start at this line (1-indexed)"),
        endLine: z.number().optional().describe("End at this line")
      }),
      handler: async ({ filePath, startLine, endLine }, ctx) => {
        if (!isLoaded) return "No repository loaded.";
        setToolActivity(`Reading ${filePath}…`);
        const content = await withTimeout(
          fetchFileCached(buildFetchArgs(filePath, ctx?.signal)),
          8000,
          ""
        );
        setToolActivity(null);
        if (!content) return `Failed to load ${filePath} (timeout or empty).`;
        setCodeViewer(filePath, content);
        const lines = content.split("\n");
        const totalLines = lines.length;

        let start = (startLine ?? 1) - 1;
        if (start < 0) start = 0;

        let end = endLine ? endLine : start + 500;
        if (end > totalLines) end = totalLines;

        const chunk = lines.slice(start, end).join("\n");
        const truncationNotice = end < totalLines
          ? `\n\n[File has ${totalLines} lines total. Showing lines ${start + 1}-${end}. Call again with startLine=${end + 1} to read more.]`
          : "";

        return `File: ${filePath} (lines ${start + 1}-${end} of ${totalLines})\n\n${chunk}${truncationNotice}`;
      }
    },
    [isLoaded, buildFetchArgs, setCodeViewer, setToolActivity]
  );

  useFrontendTool(
    {
      name: "highlightCode",
      description: "Open a file and highlight specific lines in the viewer. Use searchCodebase first if line numbers are unknown.",
      available: true,
      parameters: z.object({
        filePath: z.string().describe("Exact file path"),
        lines: z.array(z.number().int().positive()).describe("Line numbers to highlight"),
        explanation: z.string().describe("One sentence explaining the highlighted lines")
      }),
      handler: async ({ filePath, lines, explanation }, ctx) => {
        if (!isLoaded) return "No repository loaded.";
        setToolActivity(`Opening ${filePath} and highlighting ${lines.length} line(s)…`);
        const content = await withTimeout(
          fetchFileCached(buildFetchArgs(filePath, ctx?.signal)),
          8000,
          ""
        );
        setToolActivity(null);
        if (!content) return `Failed to load ${filePath} (timeout or empty).`;
        setCodeViewer(filePath, content, { lines, explanation });
        return `Highlighted ${lines.length} line(s) in ${filePath}.\n\nContent:\n${content.slice(0, 8000)}${content.length > 8000 ? "\n[truncated — use fetchFileContent for full content]" : ""}`;
      }
    },
    [isLoaded, buildFetchArgs, setCodeViewer, setToolActivity]
  );

  useFrontendTool(
    {
      name: "generateFlowDiagram",
      description: "Generate a dependency graph for a set of files (max 10). Use for visualizing import relationships.",
      available: true,
      parameters: z.object({
        files: z.array(z.string()).describe("File paths to include (max 10)"),
        diagramType: z.enum(["dependency", "architecture"]).describe("'dependency' = import graph; 'architecture' = folder structure")
      }),
      handler: async ({ files, diagramType }, ctx) => {
        if (!isLoaded) return "No repository loaded.";
        const capped = files.slice(0, 10);
        const filePathSet = new Set(filePaths);

        setToolActivity(`Reading ${capped.length} file(s) to build dependency graph…`);
        const analyzed = await Promise.all(
          capped.map(async (path) => {
            const adapter = languageAdapters.find((a) => a.canAnalyzePath(path));
            if (!adapter) return { path, imports: [] as string[] };
            const content = await fetchFileCached(buildFetchArgs(path, ctx?.signal));
            return { path, imports: adapter.extractImports(content) };
          })
        );

        if (diagramType === "architecture") {
          setToolActivity(null);
          return "Architecture diagram is created on repo load from folders. Use dependency for file graphs.";
        }

        setToolActivity("Resolving imports and drawing graph…");
        const graph = buildDependencyGraph({
          files: analyzed,
          resolveImport: (importPath, fromFile) => {
            const adapter = languageAdapters.find((a) => a.canAnalyzePath(fromFile));
            if (!adapter) return null;
            return adapter.resolveImport({ importPath, fromFile, filePathSet });
          }
        });
        setVisualization(graph.nodes, graph.edges, "dependency");
        setToolActivity(null);
        return `Generated dependency graph for ${analyzed.length} files.`;
      }
    },
    [isLoaded, buildFetchArgs, filePaths, setVisualization, setToolActivity]
  );

  useFrontendTool(
    {
      name: "searchCodebase",
      description: "Find EXACT occurrences of text, identifiers, or regex patterns. Use this to find where a specific function is used, where a variable is defined, or to locate error messages. This is more precise than semanticSearch for technical lookups.",
      available: true,
      parameters: z.object({
        query: z.string().describe("The string, identifier, or regex pattern to search for."),
        isRegex: z.boolean().optional().describe("Set to true if using a regular expression."),
        caseSensitive: z.boolean().optional().describe("Set to true for case-sensitive matches."),
        directory: z.string().optional().describe("Search only within this directory path.")
      }),
      handler: async ({ query, isRegex, caseSensitive, directory }, ctx) => {
        if (!isLoaded) return "No repository loaded.";

        const normalizedDir = directory?.replace(/\\/g, "/").replace(/\/$/, "");

        const idx = codeIndexStore.get();
        if (idx && !isRegex && !caseSensitive) {
          setToolActivity(`Searching index for "${query}"…`);
          let hits = bm25Search(idx, query, 20);
          if (normalizedDir) {
            hits = hits.filter((h) => h.path.startsWith(normalizedDir + "/"));
          }
          setToolActivity(null);
          if (hits.length === 0) return `No matches found for "${query}".`;
          return (
            `Found ${hits.length} results (BM25 ranked):\n` +
            hits.map((h) => `${h.path}:${h.startLine}: ${h.snippet}`).join("\n")
          );
        }

        let scopePaths = filePaths;
        if (normalizedDir) {
          scopePaths = filePaths.filter((p) => p.startsWith(normalizedDir + "/"));
        }
        const scope = directory ? `in ${directory}` : "across all files";
        setToolActivity(`Searching for "${query}" ${scope}…`);
        const results = await searchContent(scopePaths, query, buildFetchArgs, {
          isRegex,
          caseSensitive,
          limit: 20,
          signal: ctx?.signal,
        });
        setToolActivity(null);
        if (results.length === 0) return `No matches found for "${query}".`;
        return `Found ${results.length} matches:\n` + results.map((r) => `${r.path}:${r.line}: ${r.content}`).join("\n");
      }
    },
    [isLoaded, filePaths, buildFetchArgs, setToolActivity]
  );

  useFrontendTool(
    {
      name: "semanticSearch",
      description: "Search the codebase for CONCEPTS and MEANING rather than exact text. Use this for abstract questions like 'how does the data flow from the UI to the API' or 'find where business logic for pricing is handled.' It is much better at finding related code that doesn't share the same keywords.",
      available: true,
      parameters: z.object({
        query: z.string().describe("A natural language description of the concept or logic you are trying to find.")
      }),
      handler: async ({ query }) => {
        if (!isLoaded) return "No repository loaded.";
        const idx = codeIndexStore.get();
        if (!idx?.hasEmbeddings) {
          // Fallback to BM25 when embeddings not available
          if (!idx) return "No index available. Try searchCodebase instead.";
          setToolActivity(`Searching (BM25 fallback) for "${query}"…`);
          const hits = bm25Search(idx, query, 15);
          setToolActivity(null);
          if (hits.length === 0) return `No results found for: "${query}".`;
          return (
            `Found ${hits.length} results (BM25 fallback — embeddings not available):\n` +
            hits.map((h) => `${h.path}:${h.startLine}: ${h.snippet}`).join("\n")
          );
        }
        setToolActivity("Generating query embedding…");
        try {
          const res = await fetch("/api/embed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ texts: [query] }),
          });
          if (!res.ok) {
            setToolActivity(null);
            const fallback = bm25Search(idx, query, 15);
            return fallback.length > 0
              ? `Embedding failed — BM25 fallback:\n` + fallback.map((h) => `${h.path}:${h.startLine}: ${h.snippet}`).join("\n")
              : "Semantic search failed and no BM25 results found.";
          }
          const { embeddings, error } = await res.json();
          if (error || !embeddings?.[0]) {
            setToolActivity(null);
            return "Failed to generate query embedding.";
          }

          setToolActivity("Finding semantically similar code…");
          const hits = semanticSearchFn(idx, embeddings[0], 15);
          setToolActivity(null);
          if (hits.length === 0) return `No semantically similar code found for: "${query}".`;
          return (
            `Found ${hits.length} semantically related code sections:\n` +
            hits.map((h) => `${h.path}:${h.startLine}-${h.endLine}: ${h.snippet}`).join("\n")
          );
        } catch (e) {
          setToolActivity(null);
          return `Semantic search failed: ${e instanceof Error ? e.message : "Unknown error"}`;
        }
      }
    },
    [isLoaded, setToolActivity]
  );

  useFrontendTool(
    {
      name: "listDirectory",
      description: "List all files and subdirectories. USE THIS FIRST when you are exploring a new part of the repo or if you aren't sure if a file exists. This tool is instant and does not count towards API limits.",
      available: true,
      parameters: z.object({
        directoryPath: z.string().describe("Path to list (e.g. 'src/components' or empty string for root)")
      }),
      handler: async ({ directoryPath }) => {
        const normalized = directoryPath.replace(/\\/g, "/").replace(/\/$/, "");
        const matches = filePaths.filter(p => {
          const dir = p.substring(0, p.lastIndexOf("/"));
          return dir === normalized || dir.startsWith(normalized + "/");
        });
        if (matches.length === 0) return `No files found in directory "${directoryPath}".`;
        return `Files in ${directoryPath} (${matches.length} total):\n` + matches.join("\n");
      }
    },
    [filePaths]
  );

  useFrontendTool(
    {
      name: "readFiles",
      description: "Fetch 2–10 files in one call. Use for comparisons or when multiple known files are needed at once. Reads up to 500 lines per file.",
      available: true,
      parameters: z.object({
        filePaths: z.array(z.string()).describe("Exact file paths to read (2–10)")
      }),
      handler: async ({ filePaths: paths }, ctx) => {
        if (!isLoaded) return "No repository loaded.";
        const capped = paths.slice(0, 10);
        setToolActivity(`Reading ${capped.length} file(s)…`);
        const contents = await Promise.all(
          capped.map(async (p) => {
            try {
              const content = await withTimeout(
                fetchFileCached(buildFetchArgs(p, ctx?.signal)),
                8000,
                ""
              );
              if (!content) return `--- ${p} ---\nTimeout: file could not be loaded.\n`;
              const lines = content.split("\n");
              const total = lines.length;
              const chunk = lines.slice(0, 500).join("\n");
              const trunc = total > 500 ? `\n\n[Showing lines 1-500 of ${total}. Use fetchFileContent with startLine/endLine to read more.]\n` : "\n";
              return `--- ${p} (${total} lines) ---\n${chunk}${trunc}`;
            } catch (e) {
              return `--- ${p} ---\nError: ${e instanceof Error ? e.message : "Failed to load"}\n`;
            }
          })
        );
        setToolActivity(null);
        return contents.join("\n");
      }
    },
    [isLoaded, buildFetchArgs, setToolActivity]
  );
}
