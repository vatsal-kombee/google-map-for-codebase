import type { LanguageAdapter } from "./types";

export const rubyAdapter: LanguageAdapter = {
  id: "ruby",
  canAnalyzePath: (path) => path.toLowerCase().endsWith(".rb"),
  extractImports: (content) => {
    const imports: string[] = [];
    // require "x" | require_relative "x"
    for (const match of content.matchAll(/^\s*(?:require|require_relative)\s+["'](.+?)["']/gm)) {
      imports.push(match[1]!);
    }
    return [...new Set(imports)].filter(Boolean);
  },
  extractSymbols: (content: string) => {
    const symbols: any[] = [];
    const lines = content.split("\n");

    // 1. Classes/Modules
    for (const match of content.matchAll(/^\s*(?:class|module)\s+([a-zA-Z0-9_$:]+)/gm)) {
      const lineIndex = content.substring(0, match.index!).split("\n").length;
      symbols.push({ name: match[1], type: "class", startLine: lineIndex });
    }

    // 2. Methods
    for (const match of content.matchAll(/^\s*def\s+([a-zA-Z0-9_$?!.]+)/gm)) {
      const lineIndex = content.substring(0, match.index!).split("\n").length;
      symbols.push({ name: match[1], type: "function", startLine: lineIndex });
    }

    // Sort and infer end lines
    symbols.sort((a, b) => a.startLine - b.startLine);
    for (let i = 0; i < symbols.length; i++) {
      const nextStart = symbols[i + 1]?.startLine ?? lines.length + 1;
      symbols[i].endLine = nextStart - 1;
    }

    return symbols;
  },
  resolveImport: ({ importPath, fromFile, filePathSet }) => {
    const fromDir = fromFile.includes("/") ? fromFile.slice(0, fromFile.lastIndexOf("/")) : "";
    const candidate = normalizePath(fromDir + "/" + importPath + ".rb");
    if (filePathSet.has(candidate)) return candidate;
    return null;
  }
};

function normalizePath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}
