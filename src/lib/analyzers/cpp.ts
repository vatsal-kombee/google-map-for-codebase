import type { LanguageAdapter } from "./types";
import { findBraceBlockEnd } from "./blockEnd";

export const cppAdapter: LanguageAdapter = {
  id: "cpp",
  canAnalyzePath: (path) =>
    [".cpp", ".c", ".cc", ".cxx", ".h", ".hpp", ".hh"].some((ext) => path.toLowerCase().endsWith(ext)),
  extractImports: (content) => {
    const imports: string[] = [];
    // #include "x.h" | #include <x.h>
    for (const match of content.matchAll(/^\s*#include\s+["<](.+?)[">]/gm)) {
      imports.push(match[1]!);
    }
    return [...new Set(imports)].filter(Boolean);
  },
  extractSymbols: (content: string) => {
    const symbols: any[] = [];
    const lines = content.split("\n");

    // 1. Classes/Structs
    for (const match of content.matchAll(/^\s*(?:class|struct)\s+([a-zA-Z0-9_$]+)/gm)) {
      const lineIndex = content.substring(0, match.index!).split("\n").length;
      symbols.push({ name: match[1], type: "class", startLine: lineIndex });
    }

    // 2. Functions (simplified regex)
    for (const match of content.matchAll(/^\s*[a-zA-Z0-9_$<>: ]+[ \t\*&]+([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*(?:const)?\s*\{/gm)) {
      const name = match[1];
      if (["if", "for", "while", "switch", "try", "catch", "return"].includes(name)) continue;
      const lineIndex = content.substring(0, match.index!).split("\n").length;
      symbols.push({ name, type: "function", startLine: lineIndex });
    }

    // 3. Logical Sections (Dividers)
    for (const match of content.matchAll(/^\s*\/\/\s*(?:─+|={3,}|-{3,}|#+)\s*([^─=\-#\n]+?)\s*(?:─+|={3,}|-{3,}|#+)?$/gm)) {
      const lineIndex = content.substring(0, match.index!).split("\n").length;
      symbols.push({ name: match[1]!.trim() || "Section", type: "heading", startLine: lineIndex });
    }

    // Sort and resolve accurate endLines via brace-matching
    symbols.sort((a, b) => a.startLine - b.startLine);
    for (const s of symbols) {
      s.endLine = findBraceBlockEnd(lines, s.startLine);
    }

    return symbols;
  },
  resolveImport: ({ importPath, fromFile, filePathSet }) => {
    // Relative: #include "foo.h"
    const fromDir = fromFile.includes("/") ? fromFile.slice(0, fromFile.lastIndexOf("/")) : "";
    const candidate = normalizePath(fromDir + "/" + importPath);
    if (filePathSet.has(candidate)) return candidate;
    
    // Check root
    if (filePathSet.has(importPath)) return importPath;
    
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
