"use client";

import { CopilotChat } from "@copilotkit/react-core/v2";
import { useAppStore } from "@/store/appStore";

export function ChatPanel() {
  const sourceMode = useAppStore((s) => s.repo.sourceMode);
  const repoInfo = useAppStore((s) => s.repo.repoInfo);
  const localInfo = useAppStore((s) => s.repo.localInfo);
  const toolActivity = useAppStore((s) => s.toolActivity);
  const indexState = useAppStore((s) => s.indexState);
  const isLoaded = sourceMode === "local" ? !!localInfo : !!repoInfo;

  const indexProgress =
    indexState.status === "building" && indexState.total > 0
      ? (indexState.progress / indexState.total) * 100
      : 0;

  return (
    <section className="panel">
      {/* Header */}
      <div className="panel-header !px-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[#00d4ff] font-bold text-[13px] tracking-tight">{">"} AI_NAV</span>
          <div className="h-3 w-px bg-white/10 mx-1" />
          <span className="font-mono text-[10px] text-white/30 uppercase tracking-[0.2em]">neural engine v2</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Indexing progress bar */}
          {indexState.status === "building" && (
            <div className="flex items-center gap-3 mr-2">
              <div className="h-1 w-20 rounded-full bg-white/[0.03] overflow-hidden border border-white/[0.05]">
                <div
                  className="h-full bg-[#4fffb0] transition-all duration-500 shadow-[0_0_8px_rgba(79,255,176,0.5)]"
                  style={{ width: `${indexProgress}%` }}
                />
              </div>
              <span className="font-mono text-[9px] tabular-nums text-white/40 tracking-tighter uppercase">
                mapping {indexState.progress}/{indexState.total}
              </span>
            </div>
          )}

          {/* Semantic badge */}
          {indexState.status === "ready" && indexState.hasEmbeddings && (
            <div className="flex items-center gap-2 rounded border border-[#00d4ff]/20 bg-[#00d4ff]/[0.06] px-2 py-0.5">
              <span className="h-1 w-1 rounded-full bg-[#00d4ff] shadow-[0_0_5px_#00d4ff]" />
              <span className="font-mono text-[9px] font-bold text-[#00d4ff] uppercase tracking-widest">
                semantic
              </span>
            </div>
          )}

          {/* Indexed badge */}
          {indexState.status === "ready" && !indexState.hasEmbeddings && (
            <div className="flex items-center gap-2 rounded border border-[#4fffb0]/20 bg-[#4fffb0]/[0.06] px-2 py-0.5">
              <span className="h-1 w-1 rounded-full bg-[#4fffb0] shadow-[0_0_5px_#4fffb0]" />
              <span className="font-mono text-[9px] font-bold text-[#4fffb0] uppercase tracking-widest">
                indexed
              </span>
            </div>
          )}

          <div className="rounded border border-white/[0.06] bg-white/[0.02] px-2 py-0.5">
            <span className="font-mono text-[9px] text-white/20 uppercase tracking-widest">
              context_ready
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="relative flex-1 overflow-hidden">
        {isLoaded ? (
          <CopilotChat
            className="h-full !font-mono"
            labels={{
              welcomeMessageText:
                'Neural link established. Ask about architecture, patterns, or specific logic flows.',
            }}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-8 px-10 text-center relative overflow-hidden">
             {/* Background glow */}
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#00d4ff]/[0.03] rounded-full blur-[80px] pointer-events-none" />

            <div className="relative opacity-20 transition-opacity hover:opacity-40">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-[#00d4ff]">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
                <path d="M4.93 4.93l14.14 14.14" />
              </svg>
            </div>
            
            <div className="space-y-3">
              <p className="font-mono text-[12px] font-bold text-white/50 uppercase tracking-[0.2em]">Offline Mode</p>
              <p className="max-w-xs font-mono text-[11px] leading-relaxed text-white/25 uppercase tracking-tight">
                AI Navigator requires an active repository link to initialize cognitive mapping.
              </p>
            </div>
            
            <div className="flex items-center gap-2 font-mono text-[9px] text-[#4fffb0]/40 uppercase tracking-widest border border-[#4fffb0]/20 bg-[#4fffb0]/5 px-4 py-2 rounded">
              <span className="animate-pulse">{">"}</span> waiting_for_input
            </div>
          </div>
        )}

        {/* Tool activity indicator */}
        {toolActivity && (
          <div className="absolute bottom-16 left-4 right-4 animate-in slide-in-from-bottom-2 fade-in duration-300">
            <div className="flex items-center gap-3 rounded border border-[#00d4ff]/30 bg-black/90 px-4 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00d4ff] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00d4ff]" />
              </span>
              <span className="font-mono text-[10px] font-bold text-[#00d4ff] uppercase tracking-widest flex-1">
                {toolActivity}
              </span>
              <div className="flex gap-1">
                <div className="h-1 w-1 bg-[#00d4ff]/40 rounded-full animate-pulse" />
                <div className="h-1 w-1 bg-[#00d4ff]/40 rounded-full animate-pulse delay-75" />
                <div className="h-1 w-1 bg-[#00d4ff]/40 rounded-full animate-pulse delay-150" />
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
