import type { LanguageAdapter } from "./types";
import { findBraceBlockEnd } from "./blockEnd";

export const dotnetAdapter: LanguageAdapter = {
  id: "dotnet",
  canAnalyzePath: (path) => path.toLowerCase().endsWith(".cs"),
  extractImports: (content) => {
    const imports: string[] = [];
    for (const match of content.matchAll(/^\s*using\s+([A-Za-z0-9_.]+)\s*;\s*$/gm)) {
      imports.push(match[1]!);
    }
    return [...new Set(imports)];
  },
  extractSymbols: (content: string) => {
    const symbols: any[] = [];
    const lines = content.split("\n");

    // 1. Classes/Interfaces/Structs
    for (const match of content.matchAll(/^\s*(?:public\s+|private\s+|protected\s+|internal\s+)?(?:abstract\s+|sealed\s+|static\s+)?(?:class|interface|struct|record)\s+([a-zA-Z0-9_$]+)/gm)) {
      const lineIndex = content.substring(0, match.index!).split("\n").length;
      symbols.push({ name: match[1], type: "class", startLine: lineIndex });
    }

    // 2. Methods
    for (const match of content.matchAll(/^\s*(?:public\s+|private\s+|protected\s+|internal\s+)?(?:static\s+|async\s+|virtual\s+|override\s+)?(?:[a-zA-Z0-9_$<>\[\]]+\s+)+([a-zA-Z0-9_$]+)\s*\(/gm)) {
      const name = match[1];
      if (["if", "for", "while", "switch", "try", "catch", "return", "using"].includes(name)) continue;
      const lineIndex = content.substring(0, match.index!).split("\n").length;
      symbols.push({ name, type: "function", startLine: lineIndex });
    }

    // Sort and resolve accurate endLines via brace-matching
    symbols.sort((a, b) => a.startLine - b.startLine);
    for (const s of symbols) {
      s.endLine = findBraceBlockEnd(lines, s.startLine);
    }

    return symbols;
  },
  resolveImport: ({ importPath, filePathSet }) => {
    // Heuristic: map namespace segments to path, look for matching .cs file
    // e.g. MyApp.Services.UserService → Services/UserService.cs
    const parts = importPath.split(".");
    // Try progressively shorter suffix matches (skip first N namespace segments)
    for (let skip = 0; skip < parts.length; skip++) {
      const asPath = parts.slice(skip).join("/");
      const candidates = [
        asPath + ".cs",
        asPath + "/" + parts[parts.length - 1] + ".cs"
      ];
      for (const c of candidates) {
        if (filePathSet.has(c)) return c;
        // Also try under src/
        if (filePathSet.has("src/" + c)) return "src/" + c;
      }
    }
    return null;
  }
};

