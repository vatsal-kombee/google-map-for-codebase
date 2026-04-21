"use client";

import ReactFlow, { Background, Controls, type Node, type Edge } from "reactflow";
import "reactflow/dist/style.css";

import { useMemo } from "react";
import { useAppStore } from "@/store/appStore";

export function GraphPanel() {
  const graphType = useAppStore((s) => s.visualization.graphType);
  const nodes = useAppStore((s) => s.visualization.nodes);
  const edges = useAppStore((s) => s.visualization.edges);

  const rfNodes: Node[] = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        data: { label: n.data.label },
        position: n.position,
        type: "default"
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
        type: "default"
      })),
    [edges]
  );

  return (
    <section className="panel h-[520px] overflow-hidden">
      <div className="panel-header">
        <span>Graph</span>
        <span className="text-xs font-normal text-white/60">{graphType ?? "—"}</span>
      </div>
      <div className="h-[calc(520px-41px)]">
        <ReactFlow nodes={rfNodes} edges={rfEdges} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </section>
  );
}

