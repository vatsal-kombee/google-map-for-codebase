import { create } from "zustand";
import type { AnalysisResult, FlowEdge, FlowNode, GraphType, RepoInfo, TreeNode } from "./types";

type RepoSlice = {
  repoInfo: RepoInfo | null;
  tree: TreeNode | null;
  filePaths: string[];
  selectedFile: string | null;
  loading: boolean;
  error: string | null;
};

type VisualizationSlice = {
  graphType: GraphType | null;
  nodes: FlowNode[];
  edges: FlowEdge[];
};

type CodeViewerSlice = {
  filePath: string | null;
  content: string | null;
  highlightedLines: number[];
  explanation: string | null;
};

type AnalysisSlice = {
  result: AnalysisResult | null;
  loading: boolean;
  error: string | null;
};

type AppState = {
  repo: RepoSlice;
  visualization: VisualizationSlice;
  codeViewer: CodeViewerSlice;
  analysis: AnalysisSlice;
  actions: {
    setRepo: (next: Partial<RepoSlice>) => void;
    setVisualization: (nodes: FlowNode[], edges: FlowEdge[], graphType: GraphType) => void;
    setSelectedFile: (filePath: string | null) => void;
    setCodeViewer: (filePath: string, content: string, opts?: { lines?: number[]; explanation?: string }) => void;
    clearCodeViewer: () => void;
    setAnalysis: (next: Partial<AnalysisSlice>) => void;
  };
};

export const useAppStore = create<AppState>((set) => ({
  repo: {
    repoInfo: null,
    tree: null,
    filePaths: [],
    selectedFile: null,
    loading: false,
    error: null
  },
  visualization: { graphType: null, nodes: [], edges: [] },
  codeViewer: { filePath: null, content: null, highlightedLines: [], explanation: null },
  analysis: { result: null, loading: false, error: null },
  actions: {
    setRepo: (next) => set((s) => ({ repo: { ...s.repo, ...next } })),
    setVisualization: (nodes, edges, graphType) =>
      set(() => ({ visualization: { nodes, edges, graphType } })),
    setSelectedFile: (filePath) =>
      set((s) => ({ repo: { ...s.repo, selectedFile: filePath } })),
    setCodeViewer: (filePath, content, opts) =>
      set(() => ({
        codeViewer: {
          filePath,
          content,
          highlightedLines: opts?.lines ?? [],
          explanation: opts?.explanation ?? null
        }
      })),
    clearCodeViewer: () =>
      set(() => ({ codeViewer: { filePath: null, content: null, highlightedLines: [], explanation: null } })),
    setAnalysis: (next) => set((s) => ({ analysis: { ...s.analysis, ...next } }))
  }
}));

