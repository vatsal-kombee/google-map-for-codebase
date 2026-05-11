"use client";

import { useMemo } from "react";
import { useAppStore } from "@/store/appStore";

type LangInfo = { label: string; dotClass: string };

const LANG_MAP: Record<string, LangInfo> = {
  ts:   { label: "TS",   dotClass: "bg-blue-400" },
  tsx:  { label: "TSX",  dotClass: "bg-sky-400" },
  js:   { label: "JS",   dotClass: "bg-yellow-400" },
  jsx:  { label: "JSX",  dotClass: "bg-yellow-300" },
  py:   { label: "PY",   dotClass: "bg-green-400" },
  rs:   { label: "RS",   dotClass: "bg-orange-400" },
  go:   { label: "GO",   dotClass: "bg-cyan-400" },
  java: { label: "JAVA", dotClass: "bg-red-400" },
  css:  { label: "CSS",  dotClass: "bg-purple-400" },
  scss: { label: "SCSS", dotClass: "bg-fuchsia-400" },
  json: { label: "JSON", dotClass: "bg-amber-400" },
  html: { label: "HTML", dotClass: "bg-orange-400" },
  md:   { label: "MD",   dotClass: "bg-slate-400" },
  yaml: { label: "YAML", dotClass: "bg-slate-400" },
  yml:  { label: "YAML", dotClass: "bg-slate-400" },
  sh:   { label: "SH",   dotClass: "bg-pink-400" },
  cs:   { label: "C#",   dotClass: "bg-violet-400" },
  cpp:  { label: "C++",  dotClass: "bg-blue-300" },
  rb:   { label: "RB",   dotClass: "bg-red-400" },
  php:  { label: "PHP",  dotClass: "bg-indigo-400" },
};

function getLang(filePath: string | null): LangInfo | null {
  if (!filePath) return null;
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return LANG_MAP[ext] ?? null;
}

export function CodeViewerPanel() {
  const viewer = useAppStore((s) => s.codeViewer);
  const clear = useAppStore((s) => s.actions.clearCodeViewer);

  const lines = useMemo(
    () => (viewer.content ? viewer.content.split(/\r?\n/g) : []),
    [viewer.content]
  );
  const highlights = new Set(viewer.highlightedLines);
  const lang = getLang(viewer.filePath);
  const fileName = viewer.filePath?.split("/").pop() ?? viewer.filePath;
  const fileSize = useMemo(() => {
    if (!viewer.content) return null;
    const bytes = new Blob([viewer.content]).size;
    return bytes > 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
  }, [viewer.content]);

  return (
    <section className="panel">
      {/* Header */}
      <div className="panel-header !px-4 h-11">
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 text-[#4fffb0] font-mono font-bold text-[13px]">{">"}</span>
          <div className="flex items-center gap-1.5 truncate">
             <span className="text-white/20 font-mono text-[11px] shrink-0">root/</span>
             <span
              className="truncate font-mono text-[11px] text-white/70 tracking-tight"
              title={viewer.filePath ?? undefined}
            >
              {viewer.filePath ?? "SOURCE_VIEW"}
            </span>
          </div>
          
          {viewer.filePath && (
            <div className="flex shrink-0 items-center gap-2 ml-1">
              {lang && (
                <div className="flex items-center gap-2 rounded border border-white/[0.08] bg-white/[0.03] px-2 py-0.5">
                  <span className={`h-1 w-1 rounded-full ${lang.dotClass} shadow-[0_0_5px_currentColor]`} />
                  <span className="font-mono text-[9px] font-bold text-white/50 uppercase tracking-widest">{lang.label}</span>
                </div>
              )}
              <div className="rounded border border-white/[0.05] bg-white/[0.02] px-2 py-0.5">
                <span className="font-mono text-[9px] text-white/20 uppercase tracking-widest">{fileSize}</span>
              </div>
              <div className="rounded border border-white/[0.05] bg-white/[0.02] px-2 py-0.5">
                <span className="font-mono text-[9px] text-white/20 uppercase tracking-widest">{lines.length} L</span>
              </div>
            </div>
          )}
        </div>
        
        <button
          className="ml-auto shrink-0 rounded border border-white/10 px-3 py-1 font-mono text-[10px] text-white/30 uppercase tracking-widest transition-all hover:border-[#4fffb0]/40 hover:bg-[#4fffb0]/5 hover:text-[#4fffb0] disabled:opacity-0 active:scale-95"
          onClick={clear}
          disabled={!viewer.filePath}
        >
          Close
        </button>
      </div>

      {/* Body */}
      <div className="panel-body !p-0">
        {!viewer.filePath ? (
          <div className="flex h-full flex-col items-center justify-center gap-8 px-10 text-center relative overflow-hidden">
             {/* Background glow */}
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#4fffb0]/[0.02] rounded-full blur-[80px] pointer-events-none" />

            <div className="relative opacity-20 transition-opacity hover:opacity-40">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-[#4fffb0]">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            
            <div className="space-y-3">
              <p className="font-mono text-[12px] font-bold text-white/50 uppercase tracking-[0.2em]">Ready to load</p>
              <p className="max-w-xs font-mono text-[11px] leading-relaxed text-white/25 uppercase tracking-tight">
                Select a file from the explorer or click a map node to display source code.
              </p>
            </div>
            
            <div className="flex items-center gap-2 font-mono text-[9px] text-[#4fffb0]/40 uppercase tracking-widest border border-[#4fffb0]/20 bg-[#4fffb0]/5 px-4 py-2 rounded">
              <span className="animate-pulse">{">"}</span> system_idle
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col p-4 gap-4 overflow-auto">
            {/* AI Explanation */}
            {viewer.explanation && (
              <div className="shrink-0 rounded border border-[#00d4ff]/30 bg-[#00d4ff]/[0.06] p-4 relative group">
                <div className="absolute top-0 right-4 -translate-y-1/2 px-2 bg-[#0d0f14] border border-[#00d4ff]/30 rounded">
                  <span className="font-mono text-[9px] font-bold text-[#00d4ff] uppercase tracking-widest">AI_ANALYSIS</span>
                </div>
                <p className="font-mono text-[12px] leading-relaxed text-white/70 italic">{viewer.explanation}</p>
              </div>
            )}

            {/* Code block */}
            <div className="flex-1 relative group overflow-hidden rounded-md border border-white/[0.08] bg-black/60 shadow-2xl">
              <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
              
              <pre className="h-full overflow-auto py-4 font-mono text-[12px] leading-[1.6]">
                {lines.map((line, idx) => {
                  const lineNo = idx + 1;
                  const isHighlighted = highlights.has(lineNo);
                  return (
                    <div
                      key={idx}
                      className={[
                        "flex items-stretch px-4 transition-colors",
                        isHighlighted
                          ? "bg-[#4fffb0]/[0.12] relative before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-[#4fffb0] before:shadow-[0_0_10px_#4fffb0]"
                          : "hover:bg-white/[0.5]",
                      ].join(" ")}
                    >
                      <span className={[
                        "mr-12 inline-block w-10 shrink-0 select-none text-right font-mono text-[11px] transition-colors",
                        isHighlighted ? "text-[#4fffb0] font-bold" : "text-white/20"
                      ].join(" ")}>
                        {lineNo}
                      </span>
                      <span className={[
                        "text-[#e8eaf0]/90 whitespace-pre",
                        isHighlighted ? "text-white font-medium" : ""
                      ].join(" ")}>
                        {line || " "}
                      </span>
                    </div>
                  );
                })}
              </pre>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
