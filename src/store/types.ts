export type RepoInfo = {
  owner: string;
  repo: string;
  branch: string;
};

export type TreeNode =
  | {
      type: "directory";
      name: string;
      path: string;
      children: TreeNode[];
    }
  | {
      type: "file";
      name: string;
      path: string;
    };

export type GraphType = "architecture" | "dependency";

export type FlowNode = {
  id: string;
  type?: string;
  data: { label: string; fullPath: string };
  position: { x: number; y: number };
};

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  type?: string;
  animated?: boolean;
};

export type AnalysisResult = {
  explanation: string;
  relevantFiles: string[];
};

