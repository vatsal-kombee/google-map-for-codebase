"use client";

import { useCallback, useMemo, useState } from "react";
import { useAppStore } from "@/store/appStore";
import type { TreeNode } from "@/store/types";
import { fetchFileCached } from "@/lib/fetchFileCached";

const LANG_COLORS: Record<string, string> = {
  ts: "bg-blue-400",   tsx: "bg-sky-400",
  js: "bg-yellow-400", jsx: "bg-yellow-300",
  py: "bg-green-400",  rs: "bg-orange-400",
  go: "bg-cyan-400",   java: "bg-red-400",
  css: "bg-purple-400", scss: "bg-fuchsia-400",
  json: "bg-amber-400", html: "bg-orange-400",
  md: "bg-slate-400",   yaml: "bg-slate-400", yml: "bg-slate-400",
  svg: "bg-emerald-400", sh: "bg-pink-400",
  cs: "bg-violet-400",  cpp: "bg-blue-300",
  rb: "bg-red-400",     php: "bg-indigo-400",
};

function LangDot({ ext }: { ext: string }) {
  return (
    <span className={`h-2 w-2 shrink-0 rounded-full opacity-80 ${LANG_COLORS[ext] ?? "bg-slate-600"}`} />
  );
}

export function RepoExplorerPanel() {
  const tree = useAppStore((s) => s.repo.tree);
  const repoInfo = useAppStore((s) => s.repo.repoInfo);
  const localInfo = useAppStore((s) => s.repo.localInfo);
  const sourceMode = useAppStore((s) => s.repo.sourceMode);
  const selectedFile = useAppStore((s) => s.repo.selectedFile);
  const filePaths = useAppStore((s) => s.repo.filePaths);
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
      try {
        let content: string;
        if (sourceMode === "local" && localInfo) {
          content = await fetchFileCached({ mode: "local", localPath: localInfo.localPath, path });
        } else if (repoInfo) {
          content = await fetchFileCached({ owner: repoInfo.owner, repo: repoInfo.repo, ref: repoInfo.branch, path });
        } else {
          return;
        }
        setCodeViewer(path, content);
      } catch {
        // Keep selection even if file fetch fails.
      }
    },
    [repoInfo, localInfo, sourceMode, setCodeViewer, setSelectedFile]
  );

  return (
    <section className="panel">
      <div className="panel-header">
        <span>Directory Tree</span>
        {filePaths.length > 0 ? (
          <span className="font-mono text-[11px] tabular-nums text-[#4fffb0]/65">
            {filePaths.length.toLocaleString()} files
          </span>
        ) : (
          <span className="text-[11px] text-white/30">
            {tree ? "loaded" : "no repo"}
          </span>
        )}
      </div>

      <div className="panel-body flex flex-col gap-2.5 overflow-hidden">
        {/* Filter input */}
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-white/35">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8.5 8.5L11 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>
          <input
            className="h-8 w-full rounded-lg border border-white/[0.09] bg-[#1a1d27] pl-7 pr-7 font-mono text-[12px] text-white/75 outline-none transition-colors placeholder:text-white/30 focus:border-[#4fffb0]/40 disabled:opacity-30"
            placeholder="Filter files…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            disabled={!tree}
          />
          {filter && (
            <button
              className="absolute inset-y-0 right-2 flex items-center text-white/30 transition-colors hover:text-[#4fffb0]/70"
              onClick={() => setFilter("")}
              title="Clear filter"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-auto">
          {!filtered ? (
            <div className="flex flex-col items-center gap-3 pt-12 text-center">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="opacity-10">
                <circle cx="20" cy="20" r="19" stroke="#4fffb0" strokeWidth="1" />
                <circle cx="20" cy="20" r="4" fill="#4fffb0" fillOpacity="0.7" />
              </svg>
              <div>
                <p className="text-[13px] font-medium text-white/35">No repository loaded</p>
                <p className="mt-1 text-[12px] text-white/25">Load one in the header above</p>
              </div>
            </div>
          ) : (
            <TreeView
              node={filtered}
              selectedFile={selectedFile}
              onSelectFile={handleSelectFile}
              level={0}
            />
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
  const [open, setOpen] = useState(true);

  if (props.node.type === "file") {
    const active = props.selectedFile === props.node.path;
    const ext = props.node.name.split(".").pop()?.toLowerCase() ?? "";
    return (
      <button
        className={[
          "flex w-full items-center gap-2 border-l-2 py-1.5 pr-2 text-left font-mono text-[12px] transition-colors",
          active
            ? "border-[#4fffb0] bg-[#4fffb0]/[0.07] text-[#4fffb0]"
            : "border-transparent text-white/55 hover:bg-white/[0.035] hover:text-white/80",
        ].join(" ")}
        style={{ paddingLeft: 8 + props.level * 14 }}
        onClick={() => props.onSelectFile(props.node.path)}
        title={props.node.path}
      >
        <LangDot ext={ext} />
        <span className="truncate">{props.node.name}</span>
      </button>
    );
  }

  return (
    <div>
      {props.level > 0 && (
        <button
          className="flex w-full items-center gap-1.5 py-1.5 pr-2 text-left transition-colors hover:bg-white/[0.03]"
          style={{ paddingLeft: 8 + props.level * 14 }}
          onClick={() => setOpen((o) => !o)}
          title={props.node.path}
        >
          <span
            className={`shrink-0 font-mono text-[10px] text-white/35 transition-transform duration-100 ${open ? "rotate-90" : ""}`}
          >
            ▶
          </span>
          <span className="truncate text-[11px] font-semibold uppercase tracking-[0.10em] text-white/45">
            {props.node.name}
          </span>
          <span className="font-mono text-[10px] text-white/25">/</span>
        </button>
      )}
      {(props.level === 0 || open) && (
        <div>
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
      )}
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
