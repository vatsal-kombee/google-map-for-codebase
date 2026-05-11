"use client";

import { useState } from "react";
import type { SourceMode } from "@/store/types";

export function RepoLoader(props: {
  repoUrl: string;
  setRepoUrl: (v: string) => void;
  onExplore: () => void;
  localPath: string;
  setLocalPath: (v: string) => void;
  onExploreLocal: () => void;
  loading: boolean;
  sourceMode: SourceMode;
  error?: string | null;
}) {
  const [mode, setMode] = useState<SourceMode>(props.sourceMode);
  const isGitHub = mode === "github";
  const canSubmit = isGitHub ? !!props.repoUrl.trim() : !!props.localPath.trim();

  function handleSubmit() {
    if (!canSubmit || props.loading) return;
    isGitHub ? props.onExplore() : props.onExploreLocal();
  }

  return (
    <div className="flex flex-col gap-2 flex-1 max-w-4xl">
      <div className="flex items-center gap-3">
        
        {/* ── Mode Toggle (Pill Design) ─────────────────────────── */}
        <div className="relative flex h-10 shrink-0 items-center rounded-full border border-white/[0.08] bg-[#0d0f14] p-1 shadow-2xl overflow-hidden">
          {/* Animated Slider */}
          <div
            className={[
              "absolute h-8 rounded-full bg-[#1a1d27] shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1)",
              isGitHub ? "left-1 w-[85px]" : "left-[90px] w-[80px]",
            ].join(" ")}
          />
          
          <button
            onClick={() => setMode("github")}
            className={[
              "relative z-10 flex h-8 w-[85px] items-center justify-center gap-2 rounded-full text-[11px] font-bold tracking-tight transition-all duration-300",
              isGitHub ? "text-[#4fffb0]" : "text-white/30 hover:text-white/50",
            ].join(" ")}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            GITHUB
          </button>
          <button
            onClick={() => setMode("local")}
            className={[
              "relative z-10 flex h-8 w-[80px] items-center justify-center gap-2 rounded-full text-[11px] font-bold tracking-tight transition-all duration-300",
              !isGitHub ? "text-[#00d4ff]" : "text-white/30 hover:text-white/50",
            ].join(" ")}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M1 3.5A1.5 1.5 0 012.5 2H6l1.5 2H13.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
            LOCAL
          </button>
        </div>

        {/* ── Input Wrapper (Glass Morphism) ────────────────────── */}
        <div className={[
          "group relative flex h-11 flex-1 items-center overflow-hidden rounded-2xl border transition-all duration-500 focus-within:ring-2 focus-within:ring-[#4fffb0]/20",
          props.loading ? "border-white/5 bg-white/[0.02]" : "border-white/[0.12] bg-[#13151c] focus-within:border-[#4fffb0]/40 focus-within:bg-[#1a1d27]"
        ].join(" ")}>
          
          {/* Shimmer overlay for loading */}
          {props.loading && <div className="absolute inset-0 animate-shimmer opacity-30" />}

          {/* Mode Prefix */}
          <div className="flex h-full items-center pl-4 pr-1">
             <span className="font-mono text-[10px] font-black text-white/10 select-none uppercase tracking-[0.2em]">
               {isGitHub ? "source" : "local"}
             </span>
          </div>

          <input
            className="h-full flex-1 bg-transparent px-2 font-mono text-[14px] font-medium text-[#e8eaf0] outline-none placeholder:text-white/15 disabled:opacity-50"
            placeholder={isGitHub ? "organization / repository" : "/absolute/path/to/project"}
            value={isGitHub ? props.repoUrl : props.localPath}
            onChange={(e) =>
              isGitHub ? props.setRepoUrl(e.target.value) : props.setLocalPath(e.target.value)
            }
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            disabled={props.loading}
            spellCheck={false}
          />

          {/* Clear button */}
          {(isGitHub ? props.repoUrl : props.localPath) && !props.loading && (
            <button
              tabIndex={-1}
              onClick={() => isGitHub ? props.setRepoUrl("") : props.setLocalPath("")}
              className="flex h-full w-12 shrink-0 items-center justify-center text-white/10 transition-all hover:scale-110 hover:text-white/40"
            >
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                <path d="M3 3l6 6M9 3L3 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {/* ── Primary Action Button (Premium Glow) ──────────────── */}
        <button
          onClick={handleSubmit}
          disabled={props.loading || !canSubmit}
          className={[
            "premium-button-glow relative flex h-11 shrink-0 items-center gap-3 overflow-hidden rounded-2xl px-8 text-[13px] font-black uppercase tracking-widest transition-all duration-300 active:scale-95",
            canSubmit && !props.loading
              ? "bg-[#4fffb0] text-[#0d0f14] shadow-[0_8px_25px_-5px_rgba(79,255,176,0.5)]"
              : "cursor-not-allowed border border-white/5 bg-white/[0.03] text-white/10",
          ].join(" ")}
        >
          {props.loading ? (
            <div className="flex items-center gap-3">
              <div className="relative h-4 w-4">
                <div className="absolute inset-0 rounded-full border-2 border-[#0d0f14]/10" />
                <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[#0d0f14]" />
              </div>
              <span>Exploring...</span>
            </div>
          ) : (
            <>
              <span>Explore</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="transition-transform duration-300 group-hover:translate-x-1">
                <path d="M3 8h10M13 8l-4-4M13 8l-4 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </>
          )}
        </button>
      </div>

      {/* ── Error Display (Slide Up) ───────────────────────────── */}
      {props.error && (
        <div className="animate-[slide-up-fade_0.4s_ease-out] flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] font-bold text-red-400">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M8 15A7 7 0 108 1a7 7 0 000 14zM8 4a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 4zm0 6a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
          </svg>
          <span className="flex-1">{props.error}</span>
        </div>
      )}
    </div>
  );
}
