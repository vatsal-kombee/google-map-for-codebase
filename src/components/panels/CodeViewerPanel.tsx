"use client";

import { useMemo } from "react";
import { useAppStore } from "@/store/appStore";

export function CodeViewerPanel() {
  const viewer = useAppStore((s) => s.codeViewer);
  const clear = useAppStore((s) => s.actions.clearCodeViewer);

  const lines = useMemo(() => (viewer.content ? viewer.content.split(/\r?\n/g) : []), [viewer.content]);
  const highlights = new Set(viewer.highlightedLines);

  return (
    <section className="panel h-[520px] overflow-hidden">
      <div className="panel-header">
        <span className="truncate">{viewer.filePath ?? "Code Viewer"}</span>
        <button className="text-xs font-normal text-white/70 hover:text-white" onClick={clear} disabled={!viewer.filePath}>
          Clear
        </button>
      </div>
      <div className="panel-body h-[calc(520px-41px)] overflow-auto pr-2">
        {!viewer.filePath ? (
          <div className="text-sm text-white/60">Open a file from the repo explorer or ask the chat to show a file.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {viewer.explanation ? (
              <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white/80">
                {viewer.explanation}
              </div>
            ) : null}
            <pre className="overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 text-xs leading-5">
              {lines.map((line, idx) => {
                const lineNo = idx + 1;
                const isHighlighted = highlights.has(lineNo);
                return (
                  <div key={idx} className={isHighlighted ? "bg-yellow-300/10" : undefined}>
                    <span className="mr-3 inline-block w-10 select-none text-right text-white/35">{lineNo}</span>
                    <span className="text-white/85">{line || " "}</span>
                  </div>
                );
              })}
            </pre>
          </div>
        )}
      </div>
    </section>
  );
}

