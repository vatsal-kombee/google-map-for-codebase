"use client";

import { z } from "zod";
import { useFrontendTool } from "@copilotkit/react-core/v2";
import { useAppStore } from "@/store/appStore";
import { fetchFileCached } from "@/lib/fetchFileCached";
import { findFilesByQuery } from "@/lib/findFilesByQuery";
import { buildDependencyGraph } from "@/lib/graph";
import { languageAdapters } from "@/lib/analyzers";

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
  const filePaths = useAppStore((s) => s.repo.filePaths);
  const selectedFile = useAppStore((s) => s.repo.selectedFile);
  const setAnalysis = useAppStore((s) => s.actions.setAnalysis);
  const setVisualization = useAppStore((s) => s.actions.setVisualization);
  const setCodeViewer = useAppStore((s) => s.actions.setCodeViewer);

  useFrontendTool(
    {
      name: "analyzeRepository",
      description:
        "Analyze the loaded repository for a user question by fetching relevant files, extracting real imports, and updating the dependency graph.",
      parameters: z.object({
        query: z.string().describe("The user's question about the repository"),
        explanation: z.string().describe("Short explanation of what you plan to analyze")
      }),
      handler: async ({ query, explanation }, ctx) => {
        if (!repoInfo) return "No repository loaded.";

        setAnalysis({ loading: true, error: null, result: null });

        try {
          const lowerQuery = query.toLowerCase();
          const fileScopedQuery =
            Boolean(selectedFile) &&
            /(highlight|line|lines|this file|selected file|in this file|in selected file)/i.test(lowerQuery);

          // Fast path: if follow-up clearly targets current file, avoid broad repo analysis.
          if (fileScopedQuery && selectedFile) {
            const content = await fetchFileCached({
              owner: repoInfo.owner,
              repo: repoInfo.repo,
              ref: repoInfo.branch,
              path: selectedFile,
              signal: ctx?.signal
            });
            setCodeViewer(selectedFile, content);
            setAnalysis({
              loading: false,
              error: null,
              result: { explanation, relevantFiles: [selectedFile] }
            });
            return `Focused on selected file: ${selectedFile}.`;
          }

          const relevantFiles = findFilesByQuery(filePaths, query, 4);
          const prioritizedFiles = selectedFile
            ? [selectedFile, ...relevantFiles.filter((p) => p !== selectedFile)].slice(0, 4)
            : relevantFiles;
          const filePathSet = new Set(filePaths);

          const fileToAdapter = new Map<string, (typeof languageAdapters)[number]>();
          for (const p of prioritizedFiles) {
            const adapter = languageAdapters.find((a) => a.canAnalyzePath(p));
            if (adapter) fileToAdapter.set(p, adapter);
          }

          const analyzed = await Promise.all(
            [...fileToAdapter.entries()].map(async ([path, adapter]) => {
              const content = await withTimeout(
                fetchFileCached({
                  owner: repoInfo.owner,
                  repo: repoInfo.repo,
                  ref: repoInfo.branch,
                  path,
                  signal: ctx?.signal
                }),
                4000,
                ""
              );
              return { path, imports: adapter.extractImports(content) };
            })
          );

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

          if (analyzed[0]?.path) {
            const content = await withTimeout(
              fetchFileCached({
                owner: repoInfo.owner,
                repo: repoInfo.repo,
                ref: repoInfo.branch,
                path: analyzed[0].path,
                signal: ctx?.signal
              }),
              4000,
              ""
            );
            setCodeViewer(analyzed[0].path, content);
          }

          return `Analyzed ${analyzed.length} file(s) and updated the graph.`;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          setAnalysis({ loading: false, error: msg });
          return `Analysis failed: ${msg}`;
        }
      }
    },
    [repoInfo?.owner, repoInfo?.repo, repoInfo?.branch, filePaths.length, selectedFile]
  );

  useFrontendTool(
    {
      name: "fetchFileContent",
      description: "Open a repository file in the code viewer (exact file path required).",
      parameters: z.object({
        filePath: z.string().describe("Exact file path from the repository file list")
      }),
      handler: async ({ filePath }, ctx) => {
        if (!repoInfo) return "No repository loaded.";
        const content = await fetchFileCached({
          owner: repoInfo.owner,
          repo: repoInfo.repo,
          ref: repoInfo.branch,
          path: filePath,
          signal: ctx?.signal
        });
        setCodeViewer(filePath, content);
        return `Opened ${filePath}`;
      }
    },
    [repoInfo?.owner, repoInfo?.repo, repoInfo?.branch]
  );

  useFrontendTool(
    {
      name: "highlightCode",
      description: "Open a file and highlight specific line numbers with a short explanation.",
      parameters: z.object({
        filePath: z.string().describe("Exact file path from the repository file list"),
        lines: z.array(z.number().int().positive()).describe("Line numbers to highlight"),
        explanation: z.string().describe("Why these lines matter")
      }),
      handler: async ({ filePath, lines, explanation }, ctx) => {
        if (!repoInfo) return "No repository loaded.";
        const content = await fetchFileCached({
          owner: repoInfo.owner,
          repo: repoInfo.repo,
          ref: repoInfo.branch,
          path: filePath,
          signal: ctx?.signal
        });
        setCodeViewer(filePath, content, { lines, explanation });
        return `Highlighted ${lines.length} line(s) in ${filePath}`;
      }
    },
    [repoInfo?.owner, repoInfo?.repo, repoInfo?.branch]
  );

  useFrontendTool(
    {
      name: "generateFlowDiagram",
      description: "Generate a dependency graph for a specific list of files.",
      parameters: z.object({
        files: z.array(z.string()).describe("Exact file paths from the repository file list"),
        diagramType: z.enum(["dependency", "architecture"]).describe("Which diagram type to display")
      }),
      handler: async ({ files, diagramType }, ctx) => {
        if (!repoInfo) return "No repository loaded.";
        const capped = files.slice(0, 10);
        const filePathSet = new Set(filePaths);

        const analyzed = await Promise.all(
          capped.map(async (path) => {
            const adapter = languageAdapters.find((a) => a.canAnalyzePath(path));
            if (!adapter) return { path, imports: [] as string[] };
            const content = await fetchFileCached({
              owner: repoInfo.owner,
              repo: repoInfo.repo,
              ref: repoInfo.branch,
              path,
              signal: ctx?.signal
            });
            return { path, imports: adapter.extractImports(content) };
          })
        );

        if (diagramType === "architecture") {
          return "Architecture diagram is created on repo load from folders. Use dependency for file graphs.";
        }

        const graph = buildDependencyGraph({
          files: analyzed,
          resolveImport: (importPath, fromFile) => {
            const adapter = languageAdapters.find((a) => a.canAnalyzePath(fromFile));
            if (!adapter) return null;
            return adapter.resolveImport({ importPath, fromFile, filePathSet });
          }
        });
        setVisualization(graph.nodes, graph.edges, "dependency");
        return `Generated dependency graph for ${analyzed.length} files.`;
      }
    },
    [repoInfo?.owner, repoInfo?.repo, repoInfo?.branch, filePaths.length]
  );
}

