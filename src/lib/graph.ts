import dagre from "dagre";
import type { FlowEdge, FlowNode, TreeNode } from "@/store/types";
import { flattenTree } from "./tree";
import type { GraphNode, GraphEdge } from "@/app/api/analyze/route";

// ── Overview graph (folder structure) ────────────────────────────────────────

export function buildOverviewGraph(tree: TreeNode): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  if (tree.type !== "directory") return { nodes, edges };

  const rootId = "__root__";
  nodes.push({
    id: rootId,
    type: "default",
    data: { label: tree.path || "root", fullPath: "" },
    position: { x: 0, y: 0 }
  });

  // Top-level dirs as second level
  const topDirs = tree.children.filter((c) => c.type === "directory");
  let i = 0;
  for (const dir of topDirs) {
    const fileCount = flattenTree(dir).length;
    const id = dir.path;
    nodes.push({
      id,
      type: "default",
      data: { label: `📁 ${dir.name} (${fileCount})`, fullPath: dir.path },
      position: { x: 0, y: 0 }
    });
    edges.push({ id: `e-root-${i++}`, source: rootId, target: id, animated: false });

    // Second level: subdirs inside each top dir
    if (dir.type === "directory") {
      for (const sub of dir.children.filter((c) => c.type === "directory")) {
        const subCount = flattenTree(sub).length;
        const subId = sub.path;
        nodes.push({
          id: subId,
          type: "default",
          data: { label: `📁 ${sub.name} (${subCount})`, fullPath: sub.path },
          position: { x: 0, y: 0 }
        });
        edges.push({ id: `e-sub-${i++}`, source: id, target: subId, animated: false });
      }
      // Top-level files in this dir
      for (const file of dir.children.filter((c) => c.type === "file")) {
        nodes.push({
          id: file.path,
          type: "default",
          data: { label: `📄 ${file.name}`, fullPath: file.path },
          position: { x: 0, y: 0 }
        });
        edges.push({ id: `e-file-${i++}`, source: id, target: file.path, animated: false });
      }
    }
  }

  // Root-level files
  for (const file of tree.children.filter((c) => c.type === "file")) {
    nodes.push({
      id: file.path,
      type: "default",
      data: { label: `📄 ${file.name}`, fullPath: file.path },
      position: { x: 0, y: 0 }
    });
    edges.push({ id: `e-rootfile-${i++}`, source: rootId, target: file.path, animated: false });
  }

  return applyDagreLayout(nodes, edges, { rankdir: "TB", ranksep: 100, nodesep: 50 });
}

// ── Full dependency graph (from /api/analyze) ─────────────────────────────────

export function buildFullDependencyGraph(
  apiNodes: GraphNode[],
  apiEdges: GraphEdge[]
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  // Color-code by language
  const LANG_COLOR: Record<string, string> = {
    jsTs: "#3b82f6",
    python: "#f59e0b",
    php: "#8b5cf6",
    dotnet: "#10b981",
    go: "#06b6d4",
    java: "#f97316",
    rust: "#ef4444",
    unknown: "#6b7280"
  };

  const maxIn = Math.max(1, ...apiNodes.map((n) => n.inDegree));

  const nodes: FlowNode[] = apiNodes.map((n) => ({
    id: n.id,
    type: "default",
    data: {
      label: n.label,
      fullPath: n.fullPath,
      // Pass extra metadata for custom node rendering if needed
      meta: {
        inDegree: n.inDegree,
        outDegree: n.outDegree,
        language: n.language,
        color: LANG_COLOR[n.language] ?? LANG_COLOR.unknown,
        // Hub nodes (top 10% by inDegree) get a star prefix
        isHub: n.inDegree > 0 && n.inDegree >= maxIn * 0.5
      }
    },
    position: { x: 0, y: 0 }
  }));

  const edges: FlowEdge[] = apiEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: true,
    type: "smoothstep"
  }));

  // Use LR layout for dependency graphs; TB for large ones
  const rankdir = nodes.length > 80 ? "TB" : "LR";
  return applyDagreLayout(nodes, edges, { rankdir, ranksep: 100, nodesep: 40 });
}

// ── Legacy dependency graph (used by AI tools for partial analysis) ───────────

export function buildDependencyGraph(args: {
  files: { path: string; imports: string[] }[];
  resolveImport: (importPath: string, fromFile: string) => string | null;
}): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = args.files.map((f) => ({
    id: f.path,
    type: "default",
    data: { label: f.path.split("/").pop() || f.path, fullPath: f.path },
    position: { x: 0, y: 0 }
  }));

  const edges: FlowEdge[] = [];
  let eid = 0;
  for (const f of args.files) {
    for (const imp of f.imports) {
      const resolved = args.resolveImport(imp, f.path);
      if (!resolved) continue;
      edges.push({ id: `e-${eid++}`, source: f.path, target: resolved, animated: true, type: "smoothstep" });
    }
  }

  return applyDagreLayout(nodes, edges, { rankdir: "LR", ranksep: 100, nodesep: 40 });
}

// ── Dagre layout ──────────────────────────────────────────────────────────────

const DAGRE_NODE_LIMIT = 1500;
const GRID_COL_WIDTH   = 280;
const GRID_ROW_HEIGHT  = 100;
const GRID_COLS        = 12;

function applyGridLayout(nodes: FlowNode[]): FlowNode[] {
  return nodes.map((n, i) => ({
    ...n,
    position: {
      x: (i % GRID_COLS) * GRID_COL_WIDTH,
      y: Math.floor(i / GRID_COLS) * GRID_ROW_HEIGHT
    }
  }));
}

export function applyDagreLayout(
  nodes: FlowNode[],
  edges: FlowEdge[],
  opts?: { rankdir?: "TB" | "LR"; ranksep?: number; nodesep?: number }
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  if (nodes.length > DAGRE_NODE_LIMIT) {
    return { nodes: applyGridLayout(nodes), edges };
  }

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: opts?.rankdir ?? "TB",
    ranksep: opts?.ranksep ?? 80,
    nodesep: opts?.nodesep ?? 40
  });

  for (const node of nodes) g.setNode(node.id, { width: 220, height: 58 });
  for (const edge of edges) {
    // dagre requires both nodes to exist
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(g);

  const laidOut = nodes.map((n) => {
    const pos = g.node(n.id) as { x: number; y: number } | undefined;
    return { ...n, position: { x: (pos?.x ?? 0) - 110, y: (pos?.y ?? 0) - 29 } };
  });

  return { nodes: laidOut, edges };
}
