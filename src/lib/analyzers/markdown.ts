import type { LanguageAdapter } from "./types";

export const markdownAdapter: LanguageAdapter = {
  id: "markdown",
  canAnalyzePath: (path) => path.toLowerCase().endsWith(".md") || path.toLowerCase().endsWith(".markdown"),
  extractImports: () => [], // Markdown doesn't have standard imports in this context
  extractSymbols: (content: string) => {
    const symbols: any[] = [];
    const lines = content.split("\n");

    // 1. Headings
    for (const match of content.matchAll(/^(#{1,6})\s+(.+)$/gm)) {
      const lineIndex = content.substring(0, match.index!).split("\n").length;
      symbols.push({ name: match[2].trim(), type: "heading", startLine: lineIndex });
    }

    // 2. Code Blocks
    for (const match of content.matchAll(/^```([a-z]*)\s*([\s\S]*?)```/gm)) {
      const lineIndex = content.substring(0, match.index!).split("\n").length;
      const lang = match[1] || "text";
      symbols.push({ name: `code block (${lang})`, type: "block", startLine: lineIndex });
    }

    // Sort and infer end lines
    symbols.sort((a, b) => a.startLine - b.startLine);
    for (let i = 0; i < symbols.length; i++) {
      const nextStart = symbols[i + 1]?.startLine ?? lines.length + 1;
      symbols[i].endLine = nextStart - 1;
    }

    return symbols;
  },
  resolveImport: () => null
};
