import dagre from "dagre";
import type { FlowEdge, FlowNode, TreeNode } from "@/store/types";
import { flattenTree } from "./tree";

export function buildOverviewGraph(tree: TreeNode): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  const rootId = "root";
  nodes.push({ id: rootId, data: { label: tree.path || "root", fullPath: "" }, position: { x: 0, y: 0 } });

  if (tree.type !== "directory") return { nodes, edges };
  const topDirs = tree.children.filter((c) => c.type === "directory");

  let i = 0;
  for (const dir of topDirs) {
    const fileCount = flattenTree(dir).length;
    const id = dir.path;
    nodes.push({
      id,
      data: { label: `${dir.name} (${fileCount})`, fullPath: dir.path },
      position: { x: 0, y: 0 }
    });
    edges.push({ id: `e-${rootId}-${id}-${i++}`, source: rootId, target: id, animated: false });
  }

  return applyDagreLayout(nodes, edges, { rankdir: "TB" });
}

export function buildDependencyGraph(args: {
  files: { path: string; imports: string[] }[];
  resolveImport: (importPath: string, fromFile: string) => string | null;
}): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = args.files.map((f) => ({
    id: f.path,
    data: { label: f.path.split("/").pop() || f.path, fullPath: f.path },
    position: { x: 0, y: 0 }
  }));

  const edges: FlowEdge[] = [];
  let eid = 0;
  for (const f of args.files) {
    for (const imp of f.imports) {
      const resolved = args.resolveImport(imp, f.path);
      if (!resolved) continue;
      edges.push({
        id: `e-${eid++}`,
        source: f.path,
        target: resolved,
        animated: true
      });
    }
  }

  return applyDagreLayout(nodes, edges, { rankdir: "LR" });
}

export function applyDagreLayout(
  nodes: FlowNode[],
  edges: FlowEdge[],
  opts?: { rankdir?: "TB" | "LR" }
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: opts?.rankdir ?? "TB", ranksep: 80, nodesep: 40 });

  for (const node of nodes) g.setNode(node.id, { width: 220, height: 58 });
  for (const edge of edges) g.setEdge(edge.source, edge.target);

  dagre.layout(g);

  const laidOut = nodes.map((n) => {
    const pos = g.node(n.id) as { x: number; y: number } | undefined;
    return {
      ...n,
      position: { x: (pos?.x ?? 0) - 110, y: (pos?.y ?? 0) - 29 }
    };
  });

  return { nodes: laidOut, edges };
}

