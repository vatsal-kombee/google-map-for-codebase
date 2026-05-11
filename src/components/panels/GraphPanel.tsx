"use client";

import ReactFlow, { Background, BackgroundVariant, Controls, type Node, type Edge } from "reactflow";
import "reactflow/dist/style.css";

import { useMemo } from "react";
import { useAppStore } from "@/store/appStore";
import { useFullGraph } from "@/hooks/useFullGraph";

export function GraphPanel() {
  const graphType = useAppStore((s) => s.visualization.graphType);
  const nodes = useAppStore((s) => s.visualization.nodes);
  const edges = useAppStore((s) => s.visualization.edges);
  const filePaths = useAppStore((s) => s.repo.filePaths);

  const { buildGraph, loading: graphLoading, error: graphError } = useFullGraph();

  const rfNodes: Node[] = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        data: { label: n.data.label },
        position: n.position,
        type: "default",
        style: n.data.meta?.color
          ? {
              borderColor: n.data.meta.color,
              borderWidth: n.data.meta.isHub ? 2 : 1,
              background: n.data.meta.isHub ? n.data.meta.color + "22" : undefined,
              fontWeight: n.data.meta.isHub ? 700 : 400,
            }
          : undefined,
      })),
    [nodes]
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        animated: e.animated ?? false,
        type: e.type ?? "default",
      })),
    [edges]
  );

  return (
    <div className="relative h-full w-full">

      {/* Floating controls — top right */}
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        {nodes.length > 0 && (
          <span className="rounded-lg border border-white/[0.10] bg-[#13151c]/95 px-3 py-1.5 font-mono text-[11px] text-white/50">
            {graphType && (
              <span className="mr-2 text-[#4fffb0]/70">{graphType}</span>
            )}
            {nodes.length} nodes · {edges.length} edges
          </span>
        )}

        {filePaths.length > 0 && (
          <button
            className={[
              "flex items-center gap-2 rounded-lg border px-4 py-1.5 text-[13px] font-semibold transition-colors",
              graphLoading
                ? "cursor-not-allowed border-white/[0.08] text-white/30"
                : "border-[#4fffb0]/35 bg-[#4fffb0]/[0.09] text-[#4fffb0] hover:bg-[#4fffb0]/[0.16]",
            ].join(" ")}
            onClick={buildGraph}
            disabled={graphLoading}
            title="Analyze all project files and build the full import dependency graph"
          >
            {graphLoading ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current/20 border-t-current" />
                Analyzing…
              </>
            ) : (
              "Build Graph ↗"
            )}
          </button>
        )}
      </div>

      {/* Error banner */}
      {graphError && (
        <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2.5 border-b border-red-800/50 bg-red-950/85 px-4 py-2 text-[12px] text-red-400">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="6.5" cy="6.5" r="6" stroke="currentColor" strokeWidth="1.2" />
            <path d="M6.5 4v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <rect x="6" y="8.5" width="1" height="1" fill="currentColor" />
          </svg>
          {graphError}
        </div>
      )}

      {/* Empty state */}
      {nodes.length === 0 && !graphLoading && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-5 text-center">
          <svg width="64" height="64" viewBox="0 0 60 60" fill="none" className="opacity-10">
            <circle cx="30" cy="12" r="7" stroke="#4fffb0" strokeWidth="1.2" />
            <circle cx="12" cy="44" r="7" stroke="#4fffb0" strokeWidth="1.2" />
            <circle cx="48" cy="44" r="7" stroke="#4fffb0" strokeWidth="1.2" />
            <line x1="30" y1="19" x2="12" y2="37" stroke="#4fffb0" strokeWidth="1" strokeOpacity="0.6" />
            <line x1="30" y1="19" x2="48" y2="37" stroke="#4fffb0" strokeWidth="1" strokeOpacity="0.6" />
            <line x1="19" y1="44" x2="41" y2="44" stroke="#4fffb0" strokeWidth="1" strokeOpacity="0.4" />
            <circle cx="30" cy="12" r="2.5" fill="#4fffb0" fillOpacity="0.8" />
            <circle cx="12" cy="44" r="2.5" fill="#4fffb0" fillOpacity="0.8" />
            <circle cx="48" cy="44" r="2.5" fill="#4fffb0" fillOpacity="0.8" />
          </svg>
          <div>
            <p className="text-[15px] font-medium text-white/35">No graph built yet</p>
            <p className="mt-1.5 font-mono text-[12px] text-white/25">
              {filePaths.length > 0
                ? 'Click "Build Graph ↗" above or ask the AI'
                : "Load a repository first"}
            </p>
          </div>
        </div>
      )}

      <ReactFlow nodes={rfNodes} edges={rfEdges} fitView>
        <Background
          variant={BackgroundVariant.Dots}
          color="rgba(255,255,255,0.05)"
          gap={28}
          size={1}
        />
        <Controls />
      </ReactFlow>
    </div>
  );
}
