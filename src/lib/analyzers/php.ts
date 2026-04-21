import type { LanguageAdapter } from "./types";

export const phpAdapter: LanguageAdapter = {
  id: "php",
  canAnalyzePath: (path) => path.toLowerCase().endsWith(".php"),
  extractImports: (content) => {
    // Stage 1: only string-literal include/require targets
    const imports: string[] = [];
    for (const match of content.matchAll(
      /\b(?:require_once|require|include_once|include)\s*(?:\(\s*)?["'](.+?)["']\s*\)?\s*;/g
    )) {
      imports.push(match[1]!);
    }
    return [...new Set(imports)];
  },
  resolveImport: ({ importPath, fromFile, filePathSet }) => {
    // For now: only relative path includes (best-effort)
    if (!importPath.startsWith(".") && !importPath.startsWith("/")) return null;
    const fromDir = fromFile.includes("/") ? fromFile.slice(0, fromFile.lastIndexOf("/")) : "";
    const candidate = normalizePath(joinPaths(fromDir, importPath));
    const tries = [candidate, candidate + ".php", candidate.replace(/\/+$/, "") + "/index.php"];
    for (const t of tries) {
      const normalized = normalizePath(t);
      if (filePathSet.has(normalized)) return normalized;
    }
    return null;
  }
};

function joinPaths(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a.replace(/\/+$/, "") + "/" + b.replace(/^\/+/, "");
}

function normalizePath(path: string): string {
  const parts = path.split("/").filter((p) => p.length > 0);
  const out: string[] = [];
  for (const p of parts) {
    if (p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

