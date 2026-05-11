export type SourceMode = "github" | "local";

export type RepoInfo = {
  owner: string;
  repo: string;
  branch: string;
};

export type LocalInfo = {
  folderName: string;
  localPath: string;
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
  data: {
    label: string;
    fullPath: string;
    meta?: {
      inDegree: number;
      outDegree: number;
      language: string;
      color: string;
      isHub: boolean;
    };
  };
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

