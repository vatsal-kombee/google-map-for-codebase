"use client";

import { useCallback, useMemo, useState } from "react";
import { useAppStore } from "@/store/appStore";
import type { TreeNode } from "@/store/types";
import { fetchFileCached } from "@/lib/fetchFileCached";

export function RepoExplorerPanel() {
  const tree = useAppStore((s) => s.repo.tree);
  const repoInfo = useAppStore((s) => s.repo.repoInfo);
  const selectedFile = useAppStore((s) => s.repo.selectedFile);
  const setSelectedFile = useAppStore((s) => s.actions.setSelectedFile);
  const setCodeViewer = useAppStore((s) => s.actions.setCodeViewer);

  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    if (!tree) return null;
    const q = filter.trim().toLowerCase();
    if (!q) return tree;
    return filterTree(tree, (p) => p.toLowerCase().includes(q));
  }, [tree, filter]);

  const handleSelectFile = useCallback(
    async (path: string) => {
      setSelectedFile(path);
      if (!repoInfo) return;
      try {
        const content = await fetchFileCached({
          owner: repoInfo.owner,
          repo: repoInfo.repo,
          ref: repoInfo.branch,
          path
        });
        setCodeViewer(path, content);
      } catch {
        // Keep selection state even if fetching file content fails.
      }
    },
    [repoInfo, setCodeViewer, setSelectedFile]
  );

  return (
    <section className="panel h-[520px] overflow-hidden">
      <div className="panel-header">
        <span>Repo Explorer</span>
        <span className="text-xs font-normal text-white/60">{tree ? "loaded" : "no repo"}</span>
      </div>
      <div className="panel-body flex h-[calc(520px-41px)] flex-col gap-3 overflow-hidden">
        <input
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-white/40"
          placeholder="Filter files…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          disabled={!tree}
        />
        <div className="flex-1 overflow-auto pr-2 text-sm">
          {!filtered ? (
            <div className="text-white/60">Paste a GitHub URL and click Explore.</div>
          ) : (
            <TreeView node={filtered} selectedFile={selectedFile} onSelectFile={handleSelectFile} level={0} />
          )}
        </div>
      </div>
    </section>
  );
}

function TreeView(props: {
  node: TreeNode;
  selectedFile: string | null;
  onSelectFile: (path: string) => Promise<void> | void;
  level: number;
}) {
  if (props.node.type === "file") {
    const active = props.selectedFile === props.node.path;
    return (
      <button
        className={[
          "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left",
          active ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10"
        ].join(" ")}
        style={{ paddingLeft: 8 + props.level * 12 }}
        onClick={() => props.onSelectFile(props.node.path)}
        title={props.node.path}
      >
        <span className="truncate">{props.node.name}</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col">
      {props.level > 0 ? (
        <div
          className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-white/50"
          style={{ paddingLeft: 8 + props.level * 12 }}
          title={props.node.path}
        >
          {props.node.name}
        </div>
      ) : null}
      <div className="flex flex-col">
        {props.node.children.map((child) => (
          <TreeView
            key={child.path}
            node={child}
            selectedFile={props.selectedFile}
            onSelectFile={props.onSelectFile}
            level={props.level + 1}
          />
        ))}
      </div>
    </div>
  );
}

function filterTree(root: TreeNode, matchFilePath: (path: string) => boolean): TreeNode | null {
  if (root.type === "file") return matchFilePath(root.path) ? root : null;
  const nextChildren = root.children
    .map((c) => filterTree(c, matchFilePath))
    .filter((v): v is TreeNode => v !== null);
  if (nextChildren.length === 0) return null;
  return { ...root, children: nextChildren };
}

