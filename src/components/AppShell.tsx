"use client";

import { useState, useCallback } from "react";
import { useAppStore } from "@/store/appStore";
import { fetchFileCached } from "@/lib/fetchFileCached";

import { GraphPanel } from "@/components/panels/GraphPanel";
import { RepoExplorerPanel } from "@/components/panels/RepoExplorerPanel";
import { CodeViewerPanel } from "@/components/panels/CodeViewerPanel";
import { ChatPanel } from "@/components/panels/ChatPanel";

type Tab = "graph" | "files" | "dependencies" | "chat";

// ── Tab icons (15 × 15) ────────────────────────────────────────
function GraphIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <circle cx="7.5" cy="2.5" r="1.75" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="2.5" cy="11.5" r="1.75" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12.5" cy="11.5" r="1.75" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7.5 4.25L2.5 9.75M7.5 4.25L12.5 9.75M4.25 11.5h6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
function FilesIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M2.5 3A1.5 1.5 0 014 1.5h4.5L12 5v8a1.5 1.5 0 01-1.5 1.5h-6A1.5 1.5 0 013 13.5V3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M8.5 1.5V5H12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 8.5h5M5 10.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
function ImportsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <circle cx="3" cy="7.5" r="1.75" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12" cy="3" r="1.75" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12" cy="12" r="1.75" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.75 7L10.25 3.5M4.75 8L10.25 11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M1.5 2h12a1 1 0 011 1v6a1 1 0 01-1 1H8.5L5.5 13V10H1.5a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M4 5.5h7M4 7.5h4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

const TABS: { id: Tab; Icon: React.FC; label: string; hint: string }[] = [
  { id: "graph", Icon: GraphIcon, label: "graph", hint: "Interactive dependency map — see how files connect" },
  { id: "files", Icon: FilesIcon, label: "files", hint: "Browse the directory tree and read source files" },
  { id: "dependencies", Icon: ImportsIcon, label: "imports", hint: "Full list of import relationships" },
  { id: "chat", Icon: ChatIcon, label: "chat", hint: "Ask the AI questions about this codebase" },
];

// ── AppShell ───────────────────────────────────────────────────
export function AppShell() {
  const [activeTab, setActiveTab] = useState<Tab>("graph");

  const filePaths = useAppStore((s) => s.repo.filePaths);
  const nodes = useAppStore((s) => s.visualization.nodes);
  const edges = useAppStore((s) => s.visualization.edges);
  const selectedFile = useAppStore((s) => s.repo.selectedFile);
  const repoInfo = useAppStore((s) => s.repo.repoInfo);
  const localInfo = useAppStore((s) => s.repo.localInfo);
  const sourceMode = useAppStore((s) => s.repo.sourceMode);
  const indexState = useAppStore((s) => s.indexState);
  const setSelectedFile = useAppStore((s) => s.actions.setSelectedFile);
  const setCodeViewer = useAppStore((s) => s.actions.setCodeViewer);

  const isLoading = indexState.status === "building";
  const hasRepo = filePaths.length > 0;

  const inDegree = new Map<string, number>();
  edges.forEach((e) => inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1));
  const topNodes = [...nodes]
    .map((n) => ({ ...n, count: inDegree.get(n.id) ?? 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 40);
  const hubCount = nodes.filter((n) => n.data.meta?.isHub).length;

  const handleNodeClick = useCallback(
    async (nodeId: string) => {
      setSelectedFile(nodeId);
      setActiveTab("files");
      try {
        let content: string;
        if (sourceMode === "local" && localInfo) {
          content = await fetchFileCached({ mode: "local", localPath: localInfo.localPath, path: nodeId });
        } else if (repoInfo) {
          content = await fetchFileCached({ owner: repoInfo.owner, repo: repoInfo.repo, ref: repoInfo.branch, path: nodeId });
        } else return;
        setCodeViewer(nodeId, content);
      } catch {
        // Keep selection even if fetch fails
      }
    },
    [repoInfo, localInfo, sourceMode, setSelectedFile, setCodeViewer]
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ minHeight: 0 }}>

      {/* ── Tab bar ───────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center border-b border-white/[0.08] bg-[#13151c] px-5 h-11">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            title={tab.hint}
            className={[
              "flex items-center gap-2.5 h-full px-4 text-[12px] font-mono transition-all relative group",
              activeTab === tab.id
                ? "text-[#4fffb0]"
                : "text-white/40 hover:text-white/70",
            ].join(" ")}
          >
            <span className={activeTab === tab.id ? "text-[#4fffb0]" : "text-white/30 group-hover:text-white/50"}>
              <tab.Icon />
            </span>
            {tab.label}
            
            {/* Active Indicator */}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#4fffb0] shadow-[0_0_8px_rgba(79,255,176,0.4)]" />
            )}

            {tab.id === "graph" && nodes.length > 0 && (
              <span className="rounded bg-[#4fffb0]/10 px-1 py-0.5 text-[9px] text-[#4fffb0]/60">
                {nodes.length}
              </span>
            )}
            {tab.id === "chat" && (
              <span className="rounded bg-[#00d4ff]/10 px-1 py-0.5 text-[9px] text-[#00d4ff]/60 font-bold">
                AI
              </span>
            )}
          </button>
        ))}

        {/* Status pill */}
        <div className="ml-auto flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1">
          <span
            className={`h-1.5 w-1.5 rounded-full ${isLoading ? "animate-pulse bg-[#4fffb0]" : hasRepo ? "bg-[#4fffb0]" : "bg-white/10"
              }`}
          />
          <span className="font-mono text-[10px] text-white/40 uppercase tracking-tighter">
            {isLoading
              ? `indexing ${indexState.progress}/${indexState.total}`
              : hasRepo
                ? `${filePaths.length} files`
                : "offline"}
          </span>
        </div>
      </div>

      {/* ── Content row ───────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>

        {/* ── Sidebar ─────────────────────────────────────────── */}
        <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-white/[0.08] bg-[#13151c]">
          {!hasRepo ? (
            <QuickStartGuide />
          ) : (
            <>
              {/* Stats grid */}
              <div className="shrink-0 border-b border-white/[0.08] p-4 bg-[#0d0f14]/30">
                <p className="section-label mb-3">repo stats</p>
                <div className="grid grid-cols-2 gap-2">
                  <StatCard label="FILES" value={filePaths.length || null} color="#4fffb0" />
                  <StatCard label="IMPORTS" value={edges.length || null} />
                  <StatCard label="MODULES" value={nodes.length || null} color="#00d4ff" />
                  <StatCard label="HUBS" value={hubCount || null} />
                </div>
              </div>

              {/* Top nodes header */}
              <div className="shrink-0 border-b border-white/[0.06] px-4 py-2.5">
                <p className="section-label">top nodes by imports</p>
              </div>

              {/* Top nodes list */}
              <div className="flex-1 overflow-y-auto">
                {topNodes.length > 0 ? (
                  topNodes.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleNodeClick(n.id)}
                      title={`Open ${n.id}`}
                      className={[
                        "flex w-full items-center gap-2.5 border-l-2 px-4 py-2 text-left transition-colors",
                        selectedFile === n.id
                          ? "border-[#4fffb0] bg-[#4fffb0]/[0.06]"
                          : "border-transparent hover:bg-white/[0.03]",
                      ].join(" ")}
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{
                          background: selectedFile === n.id ? "#4fffb0"
                            : n.data.meta?.isHub ? "#00d4ff"
                              : "#3a3d4a",
                        }}
                      />
                      <span
                        className={[
                          "flex-1 truncate font-mono text-[11px] tracking-tight",
                          selectedFile === n.id ? "text-[#4fffb0]" : "text-white/60",
                        ].join(" ")}
                      >
                        {n.data.label}
                      </span>
                      {n.count > 0 && (
                        <span className="shrink-0 font-mono text-[10px] text-white/20">
                          {n.count}
                        </span>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="p-4 space-y-2.5">
                    <p className="font-mono text-[11px] text-white/30 leading-relaxed uppercase">
                      No graph data
                    </p>
                    <p className="font-mono text-[10px] text-[#4fffb0]/40">
                      Build graph in Graph tab ↗
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </aside>

        {/* ── Main canvas ───────────────────────────────────────── */}
        <main
          className="relative flex-1 overflow-hidden"
          style={{
            background: "#0d0f14",
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.045) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        >
          {activeTab === "graph" && (
            hasRepo ? <GraphPanel /> : <WelcomeOverlay onSwitchTab={setActiveTab} />
          )}

          {activeTab === "files" && (
            <div className="flex h-full overflow-hidden">
              <div className="w-72 shrink-0 overflow-hidden border-r border-white/[0.08]">
                <RepoExplorerPanel />
              </div>
              <div className="flex-1 overflow-hidden">
                <CodeViewerPanel />
              </div>
            </div>
          )}

          {activeTab === "dependencies" && (
            <DependenciesView edges={edges} />
          )}

          {activeTab === "chat" && <ChatPanel />}
        </main>
      </div>

      {/* ── Persistent chat strip ──────────────────────────────── */}
      <ChatStrip onActivate={() => setActiveTab("chat")} hasRepo={hasRepo} />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number | null; color?: string }) {
  return (
    <div className="rounded border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
      <p
        className="font-mono text-[18px] font-semibold leading-none tracking-tighter"
        style={{ color: color ?? "#e8eaf0" }}
      >
        {value !== null ? value.toLocaleString() : "—"}
      </p>
      <p className="mt-2 font-mono text-[9px] font-medium text-white/30 tracking-widest">{label}</p>
    </div>
  );
}

function QuickStartGuide() {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-4">
      <p className="section-label mb-5 tracking-widest">getting started</p>

      <div className="flex flex-col gap-6">
        {[
          {
            step: "01",
            color: "#4fffb0",
            title: "Load repository",
            desc: "Paste a GitHub URL or local path in the header and click Explore.",
          },
          {
            step: "02",
            color: "#4fffb0",
            title: "Build the graph",
            desc: "Go to Graph tab and click Build Graph to map file relationships.",
          },
          {
            step: "03",
            color: "#00d4ff",
            title: "Explore & ask AI",
            desc: "Click nodes to read code. Use Chat to ask about the architecture.",
          },
        ].map((s) => (
          <div key={s.step} className="flex gap-4">
            <div
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border font-mono text-[9px] font-bold mt-0.5"
              style={{ borderColor: s.color + "40", color: s.color, background: s.color + "10" }}
            >
              {s.step}
            </div>
            <div>
              <p className="font-mono text-[12px] font-bold text-[#e8eaf0]/90 uppercase tracking-tight">{s.title}</p>
              <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-white/30">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WelcomeOverlay({ onSwitchTab }: { onSwitchTab: (tab: Tab) => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-12 px-8 overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#4fffb0]/[0.02] rounded-full blur-[120px] pointer-events-none" />
      
      {/* Headline */}
      <div className="text-center relative">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4fffb0] animate-pulse" />
          <span className="font-mono text-[10px] tracking-[0.2em] text-white/40 uppercase">
            system ready // no repo loaded
          </span>
        </div>
        <h2 className="text-[32px] font-extrabold tracking-tight text-[#e8eaf0] font-sans">
          Navigate your codebase <br/> like a <span className="text-[#4fffb0]">tactical map.</span>
        </h2>
        <p className="mt-4 max-w-lg font-mono text-[12px] leading-relaxed text-white/30">
          Visualize dependencies, browse source code, and use AI to deconstruct 
          architecture — all starting from a single repository path.
        </p>
      </div>

      {/* Feature cards */}
      <div className="grid w-full max-w-3xl grid-cols-3 gap-5 relative">
        <FeatureCard
          icon={<GraphIcon />}
          title="Dependency Graph"
          desc="Map file relationships as an interactive, zoomable network."
          accent="#4fffb0"
          onClick={() => onSwitchTab("graph")}
        />
        <FeatureCard
          icon={<FilesIcon />}
          title="Source Browser"
          desc="Read files with context. Jump from graph nodes directly to code."
          accent="#4fffb0"
          onClick={() => onSwitchTab("files")}
        />
        <FeatureCard
          icon={<ChatIcon />}
          title="AI Architect"
          desc="Ask high-level questions about patterns and tight coupling."
          accent="#00d4ff"
          onClick={() => onSwitchTab("chat")}
        />
      </div>

      {/* Hint */}
      <div className="flex flex-col items-center gap-3 opacity-40 group hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-widest text-white/50">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="animate-bounce">
            <path d="M8 12V4M4 8l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Enter a repository path to begin
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  icon, title, desc, accent, onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-[#13151c]/50 p-6 text-left transition-all hover:border-white/[0.12] hover:bg-[#1a1d27] active:scale-[0.98] group"
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded border transition-colors"
        style={{ borderColor: accent + "30", background: accent + "08", color: accent }}
      >
        {icon}
      </div>
      <div>
        <p className="font-mono text-[13px] font-bold text-[#e8eaf0]/90 uppercase tracking-tight">{title}</p>
        <p className="mt-2 font-mono text-[11px] leading-normal text-white/30">{desc}</p>
      </div>
    </button>
  );
}

function DependenciesView({ edges }: { edges: { id: string; source: string; target: string }[] }) {
  const [filter, setFilter] = useState("");

  const filtered = filter.trim()
    ? edges.filter(
      (e) =>
        e.source.toLowerCase().includes(filter.toLowerCase()) ||
        e.target.toLowerCase().includes(filter.toLowerCase())
    )
    : edges;

  if (edges.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5">
        <div className="flex h-12 w-12 items-center justify-center rounded border border-white/[0.08] bg-white/[0.02] text-white/10">
          <ImportsIcon />
        </div>
        <div className="text-center">
          <p className="font-mono text-[12px] font-bold uppercase tracking-widest text-white/40">No imports indexed</p>
          <p className="mt-2 font-mono text-[10px] text-white/20 uppercase tracking-tight">
            Build the graph to view relationships
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#13151c]">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-4 border-b border-white/[0.08] bg-[#13151c] px-5 py-3">
        <div className="relative flex-1 max-w-sm">
          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-white/20">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.5" />
              <path d="M9 9L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <input
            className="h-9 w-full rounded border border-white/[0.12] bg-[#0d0f14] pl-9 pr-3 font-mono text-[11px] text-white/70 outline-none transition-all placeholder:text-white/10 focus:border-[#4fffb0]/40 focus:bg-[#1a1d27]"
            placeholder="FILTER RELATIONS..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <p className="ml-auto shrink-0 font-mono text-[10px] text-white/20 uppercase tracking-widest">
          {filtered.length.toLocaleString()} / {edges.length.toLocaleString()} edges
        </p>
      </div>

      {/* Column headers */}
      <div className="shrink-0 grid grid-cols-2 gap-4 border-b border-white/[0.06] bg-[#0d0f14]/40 px-5 py-2">
        <p className="section-label tracking-widest">importer</p>
        <p className="section-label tracking-widest">imported</p>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <p className="p-6 font-mono text-[11px] text-white/20 uppercase tracking-widest">No matches</p>
        ) : (
          filtered.slice(0, 500).map((e) => (
            <div
              key={e.id}
              className="grid grid-cols-2 gap-4 border-b border-white/[0.04] px-5 py-2.5 transition-colors hover:bg-white/[0.02]"
            >
              <span className="truncate font-mono text-[11px] text-white/40 tracking-tight" title={e.source}>
                {e.source}
              </span>
              <span className="truncate font-mono text-[11px] text-[#4fffb0]/50 tracking-tight" title={e.target}>
                {e.target}
              </span>
            </div>
          ))
        )}
        {filtered.length > 500 && (
          <p className="px-5 py-4 font-mono text-[10px] text-white/15 uppercase">
            Truncated at 500 results
          </p>
        )}
      </div>
    </div>
  );
}

function ChatStrip({ onActivate, hasRepo }: { onActivate: () => void; hasRepo: boolean }) {
  const SUGGESTIONS = [
    "Which files are tightly coupled?",
    "How does authentication work?",
    "What are the main entry points?",
    "Explain the folder structure",
  ];
  const placeholder = hasRepo
    ? `Ask AI Architect — e.g. "${SUGGESTIONS[Math.floor(Date.now() / 10000) % SUGGESTIONS.length]}"`
    : "Load repository to enable AI Chat";

  return (
    <div className="shrink-0 border-t border-white/[0.08] bg-[#13151c] px-5 py-3.5">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 group">
          <input
            readOnly
            onClick={hasRepo ? onActivate : undefined}
            className={[
              "h-11 w-full rounded border font-mono text-[12px] px-4 outline-none transition-all",
              hasRepo
                ? "cursor-pointer border-white/[0.14] bg-[#1a1d27] text-[#e8eaf0] placeholder:text-white/20 hover:border-white/25 focus:border-[#00d4ff]"
                : "cursor-default border-white/5 bg-white/[0.02] text-white/10 placeholder:text-white/5",
            ].join(" ")}
            placeholder={placeholder}
          />
          {hasRepo && (
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none opacity-20 group-hover:opacity-40 transition-opacity">
              <ChatIcon />
            </div>
          )}
        </div>
        <button
          onClick={hasRepo ? onActivate : undefined}
          disabled={!hasRepo}
          className="h-11 shrink-0 rounded border border-[#00d4ff]/30 bg-[#00d4ff]/[0.08] px-8 font-mono text-[12px] font-bold text-[#00d4ff] uppercase tracking-widest transition-all hover:bg-[#00d4ff]/[0.15] disabled:cursor-not-allowed disabled:opacity-20 active:scale-95 shadow-[0_0_20px_rgba(0,212,255,0.05)]"
        >
          Ask AI
        </button>
      </div>
    </div>
  );
}
