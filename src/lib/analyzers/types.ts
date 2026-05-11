export type CodeSymbol = {
  name: string;
  type: "function" | "class" | "interface" | "method" | "struct" | "trait" | "impl" | "heading" | "block" | "component" | "route" | "export" | "enum";
  startLine: number;
  endLine: number;
  isExported?: boolean;
  docstring?: string;
  // Step 4 Metadata
  complexity?: number;
  loc?: number;
  paramsCount?: number;
  depth?: number;
};

export type FileAnalysis = {
  path: string;
  imports: string[];
  symbols?: CodeSymbol[];
};

export type AnalyzeLanguageResult = {
  files: FileAnalysis[];
};

export type LanguageAdapter = {
  id: string;
  canAnalyzePath: (path: string) => boolean;
  extractImports: (content: string) => string[];
  extractSymbols?: (content: string) => CodeSymbol[];
  resolveImport: (args: { importPath: string; fromFile: string; filePathSet: Set<string> }) => string | null;
};

