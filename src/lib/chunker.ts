import type { CodeSymbol } from "./analyzers/types";

export type FileChunk = {
  path: string;
  index: number;
  startLine: number; // 1-based
  endLine: number;   // 1-based inclusive
  text: string;
  symbolName?: string;
  symbolType?: string;
  complexity?: number;
  loc?: number;
  paramsCount?: number;
};

// File types that produce no useful text for indexing
const SKIP_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "svg", "ico", "webp", "bmp",
  "woff", "woff2", "ttf", "eot", "otf",
  "zip", "tar", "gz", "rar", "7z", "br",
  "bin", "exe", "dll", "so", "dylib",
  "map", "wasm", "pyc", "o", "obj"
]);

const SKIP_FILENAMES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb",
  "composer.lock", ".DS_Store", "thumbs.db"
]);

const SKIP_PATHS = [
  "node_modules/",
  "vendor/",
  "dist/",
  "build/",
  "out/",
  ".git/",
  ".next/",
  ".cache/",
  "storage/logs/",
  "storage/framework/cache/",
  "tmp/",
  "temp/"
];

export function shouldIndexFile(path: string): boolean {
  const normalizedPath = path.replace(/\\/g, "/");
  const base = normalizedPath.split("/").pop() ?? "";
  
  if (SKIP_FILENAMES.has(base)) return false;
  
  const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
  if (SKIP_EXTENSIONS.has(ext)) return false;

  if (SKIP_PATHS.some(p => normalizedPath.includes(p) || normalizedPath.startsWith(p))) {
    return false;
  }

  return true;
}

/**
 * Intelligent chunker that respects code symbol boundaries (functions, classes).
 * Falls back to line-based chunking for gaps or non-code files.
 * 
 * Priority Order:
 * 1. Function/Class boundaries
 * 2. Export blocks
 * 3. Logical sections (headings)
 * 4. Fallback to token chunking
 */
export function chunkFile(
  path: string,
  content: string,
  symbols: CodeSymbol[] = []
): FileChunk[] {
  const lines = content.split("\n");
  if (lines.length === 0) return [];

  const chunks: FileChunk[] = [];
  const processedLines = new Set<number>();

  // Sort symbols by priority and size
  const sortedSymbols = [...symbols].sort((a, b) => {
    const priority = (s: CodeSymbol) => {
      if (s.type === "class" || s.type === "interface" || s.type === "struct") return 10;
      if (s.type === "function" || s.type === "method" || s.type === "component" || s.type === "route") return 10;
      if (s.type === "export") return 5;
      if (s.type === "heading") return 3;
      return 1;
    };
    return priority(b) - priority(a) || (a.endLine - a.startLine) - (b.endLine - b.startLine);
  });

  // 1. Process symbols as primary chunks
  for (const symbol of sortedSymbols) {
    // If it's a heading, we'll handle it in the gap filler or as a split point
    if (symbol.type === "heading") continue;

    // Skip if mostly processed already (to avoid redundant nested chunks if they are too small)
    let alreadyProcessed = 0;
    for (let l = symbol.startLine; l <= symbol.endLine; l++) {
      if (processedLines.has(l)) alreadyProcessed++;
    }
    if (alreadyProcessed > (symbol.endLine - symbol.startLine + 1) * 0.8) continue;

    const symbolLines = lines.slice(symbol.startLine - 1, symbol.endLine);
    let symbolText = symbolLines.join("\n");
    
    // Enrich text with context if it's a method or property to help LLM understand scope
    if (symbol.type === "method" || symbol.type === "function") {
      const parentSymbol = sortedSymbols.find(s => 
        (s.type === "class" || s.type === "interface") && 
        s.startLine < symbol.startLine && 
        s.endLine >= symbol.endLine
      );
      if (parentSymbol) {
        symbolText = `// Context: ${parentSymbol.type} ${parentSymbol.name}\n${symbolText}`;
      }
    }

    const tokenEstimate = estimateTokens(symbolText);

    if (tokenEstimate <= 1000) {
      chunks.push({
        path,
        index: chunks.length,
        startLine: symbol.startLine,
        endLine: symbol.endLine,
        text: symbolText,
        symbolName: symbol.name,
        symbolType: symbol.type,
        complexity: symbol.complexity,
        loc: symbol.loc,
        paramsCount: symbol.paramsCount
      });
      for (let l = symbol.startLine; l <= symbol.endLine; l++) processedLines.add(l);
    } else {
      // Large symbol: split at logical blocks or headings within it
      const subSymbols = symbols.filter(s => s !== symbol && s.startLine >= symbol.startLine && s.endLine <= symbol.endLine);
      const subChunks = splitLargeSymbol(path, symbol, lines, subSymbols);
      
      // Also enrich sub-chunks with context
      const parentSymbol = sortedSymbols.find(s => 
        (s.type === "class" || s.type === "interface") && 
        s.startLine < symbol.startLine && 
        s.endLine >= symbol.endLine
      );

      chunks.push(...subChunks.map(c => ({ 
        ...c, 
        index: chunks.length,
        text: parentSymbol ? `// Context: ${parentSymbol.type} ${parentSymbol.name}\n${c.text}` : c.text
      })));
      for (let l = symbol.startLine; l <= symbol.endLine; l++) processedLines.add(l);
    }
  }

  // 2. Fill gaps with line-based chunking, respecting headings
  const headings = symbols.filter(s => s.type === "heading").sort((a, b) => a.startLine - b.startLine);
  
  let gapStart = 1;
  while (gapStart <= lines.length) {
    if (processedLines.has(gapStart)) {
      gapStart++;
      continue;
    }

    // Find end of current gap, but stop at next heading or processed line
    let gapEnd = gapStart;
    while (gapEnd < lines.length) {
      if (processedLines.has(gapEnd + 1)) break;
      
      // Stop if next line is a heading
      if (headings.some(h => h.startLine === gapEnd + 1)) break;

      gapEnd++;
      if (gapEnd - gapStart >= 80) break; // slightly larger gaps allowed if no symbols
    }

    const gapText = lines.slice(gapStart - 1, gapEnd).join("\n");
    if (gapText.trim()) {
      chunks.push({
        path,
        index: chunks.length,
        startLine: gapStart,
        endLine: gapEnd,
        text: gapText,
        loc: gapEnd - gapStart + 1,
        complexity: (gapText.match(/\b(if|for|while|try|catch|switch)\b/g)?.length ?? 0) + 1
      });
    }
    gapStart = gapEnd + 1;
  }

  return chunks.sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine).map((c, i) => ({ ...c, index: i }));
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4); // rough approximation
}

function splitLargeSymbol(
  path: string, 
  symbol: CodeSymbol, 
  lines: string[], 
  subSymbols: CodeSymbol[] = []
): Omit<FileChunk, "index">[] {
  const subChunks: Omit<FileChunk, "index">[] = [];
  const symbolLines = lines.slice(symbol.startLine - 1, symbol.endLine);
  
  // Use sub-symbols as potential split points
  const splitPoints = new Set<number>();
  for (const s of subSymbols) {
    if (s.startLine > symbol.startLine && s.startLine < symbol.endLine) {
      splitPoints.add(s.startLine - symbol.startLine);
    }
  }

  let currentStart = 0;
  const targetSize = 60; // lines

  while (currentStart < symbolLines.length) {
    let currentEnd = Math.min(currentStart + targetSize, symbolLines.length);
    
    // 1. Try to find a sub-symbol boundary near the target end
    let foundSplit = false;
    if (currentEnd < symbolLines.length) {
      for (let i = 0; i < 30; i++) {
        const idx = currentEnd - i;
        if (idx <= currentStart) break;
        if (splitPoints.has(idx)) {
          currentEnd = idx;
          foundSplit = true;
          break;
        }
      }
    }

    // 2. Fallback to logical boundary (if/for/while/try)
    if (!foundSplit && currentEnd < symbolLines.length) {
      for (let i = 0; i < 20; i++) {
        const idx = currentEnd - i;
        if (idx <= currentStart) break;
        if (/\b(if|for|while|try|catch|switch|case|return)\b/.test(symbolLines[idx])) {
          currentEnd = idx;
          break;
        }
      }
    }

    const subText = symbolLines.slice(currentStart, currentEnd).join("\n");
    if (subText.trim()) {
      subChunks.push({
        path,
        startLine: symbol.startLine + currentStart,
        endLine: symbol.startLine + currentEnd - 1,
        text: subText,
        symbolName: symbol.name,
        symbolType: symbol.type,
        loc: currentEnd - currentStart,
        complexity: (subText.match(/\b(if|for|while|try|catch|switch|return)\b/g)?.length ?? 0) + 1
      });
    }
    currentStart = currentEnd;
  }

  return subChunks;
}
