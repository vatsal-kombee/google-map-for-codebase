"use client";

import { useCallback, useState } from "react";
import { useAppStore } from "@/store/appStore";
import { buildOverviewGraph } from "@/lib/graph";
import { flattenTree } from "@/lib/tree";
import type { TreeNode } from "@/store/types";

export function useRepository() {
  const [repoUrl, setRepoUrl] = useState("");
  const [localPath, setLocalPath] = useState("");
  const repo = useAppStore((s) => s.repo);
  const setRepo = useAppStore((s) => s.actions.setRepo);
  const setVisualization = useAppStore((s) => s.actions.setVisualization);

  // ── GitHub mode ──────────────────────────────────────────────────────────
  const loadRepository = useCallback(async () => {
    const url = repoUrl.trim();
    if (!url) return;
    setRepo({ sourceMode: "github", loading: true, error: null, tree: null, repoInfo: null, localInfo: null, filePaths: [], selectedFile: null });

    try {
      const api = new URL("/api/github/tree", window.location.origin);
      api.searchParams.set("repoUrl", url);
      const res = await fetch(api.toString());
      const data = (await res.json()) as { owner?: string; repo?: string; branch?: string; tree?: TreeNode; error?: string };
      if (!res.ok || !data.tree || !data.owner || !data.repo || !data.branch) {
        throw new Error(data.error || `Failed to load repo (${res.status})`);
      }

      const filePaths = flattenTree(data.tree);
      setRepo({
        sourceMode: "github",
        loading: false,
        error: null,
        repoInfo: { owner: data.owner, repo: data.repo, branch: data.branch },
        localInfo: null,
        tree: data.tree,
        filePaths
      });

      const overview = buildOverviewGraph(data.tree);
      setVisualization(overview.nodes, overview.edges, "architecture");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setRepo({ loading: false, error: msg });
    }
  }, [repoUrl, setRepo, setVisualization]);

  // ── Local mode ───────────────────────────────────────────────────────────
  const loadLocalRepository = useCallback(async () => {
    const p = localPath.trim();
    if (!p) return;
    setRepo({ sourceMode: "local", loading: true, error: null, tree: null, repoInfo: null, localInfo: null, filePaths: [], selectedFile: null });

    try {
      const api = new URL("/api/local/tree", window.location.origin);
      api.searchParams.set("localPath", p);
      const res = await fetch(api.toString());
      const data = (await res.json()) as { folderName?: string; localPath?: string; tree?: TreeNode; error?: string };
      if (!res.ok || !data.tree || !data.folderName || !data.localPath) {
        throw new Error(data.error || `Failed to load local path (${res.status})`);
      }

      const filePaths = flattenTree(data.tree);
      setRepo({
        sourceMode: "local",
        loading: false,
        error: null,
        repoInfo: null,
        localInfo: { folderName: data.folderName, localPath: data.localPath },
        tree: data.tree,
        filePaths
      });

      const overview = buildOverviewGraph(data.tree);
      setVisualization(overview.nodes, overview.edges, "architecture");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setRepo({ loading: false, error: msg });
    }
  }, [localPath, setRepo, setVisualization]);

  return {
    // github
    repoUrl,
    setRepoUrl,
    loadRepository,
    // local
    localPath,
    setLocalPath,
    loadLocalRepository,
    // shared
    loading: repo.loading,
    error: repo.error,
    sourceMode: repo.sourceMode
  };
}
