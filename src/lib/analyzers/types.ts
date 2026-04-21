export type FileAnalysis = {
  path: string;
  imports: string[];
};

export type AnalyzeLanguageResult = {
  files: FileAnalysis[];
};

export type LanguageAdapter = {
  id: "jsTs" | "php" | "dotnet";
  canAnalyzePath: (path: string) => boolean;
  extractImports: (content: string) => string[];
  resolveImport: (args: { importPath: string; fromFile: string; filePathSet: Set<string> }) => string | null;
};

