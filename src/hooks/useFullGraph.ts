"use client";

import { useCallback, useState } from "react";
import { useAppStore } from "@/store/appStore";
import { buildFullDependencyGraph } from "@/lib/graph";
import type { AnalyzeResponse } from "@/app/api/analyze/route";

export function useFullGraph() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const repoInfo = useAppStore((s) => s.repo.repoInfo);
    const localInfo = useAppStore((s) => s.repo.localInfo);
    const sourceMode = useAppStore((s) => s.repo.sourceMode);
    const filePaths = useAppStore((s) => s.repo.filePaths);
    const setVisualization = useAppStore((s) => s.actions.setVisualization);

    const buildGraph = useCallback(async () => {
        if (!filePaths.length) return;

        setLoading(true);
        setError(null);

        try {
            if (!sourceMode || (!localInfo && !repoInfo)) {
                throw new Error("No repository loaded.");
            }

            const BATCH_SIZE = 5000;
            const batches: string[][] = [];
            for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
                batches.push(filePaths.slice(i, i + BATCH_SIZE));
            }

            const allNodes = new Map<string, AnalyzeResponse["nodes"][number]>();
            const allEdges: AnalyzeResponse["edges"] = [];

            for (const batch of batches) {
                let body: object;
                if (sourceMode === "local" && localInfo) {
                    body = { mode: "local", localPath: localInfo.localPath, filePaths: batch };
                } else if (repoInfo) {
                    body = {
                        mode: "github",
                        owner: repoInfo.owner,
                        repo: repoInfo.repo,
                        branch: repoInfo.branch,
                        filePaths: batch
                    };
                } else {
                    throw new Error("No repository loaded.");
                }

                const res = await fetch("/api/analyze", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body)
                });

                const data = (await res.json()) as AnalyzeResponse & { error?: string };
                if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);

                for (const node of data.nodes) allNodes.set(node.id, node);
                allEdges.push(...data.edges);
            }

            const mergedNodes = [...allNodes.values()];

            if (mergedNodes.length === 0) {
                throw new Error("No dependency edges found. Project may use unsupported languages or no resolvable imports.");
            }

            const { nodes, edges } = buildFullDependencyGraph(mergedNodes, allEdges);
            setVisualization(nodes, edges, "dependency");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, [sourceMode, localInfo, repoInfo, filePaths, setVisualization]);

    return { buildGraph, loading, error };
}
