import type { LanguageAdapter, CodeSymbol } from "./types";
import { findBraceBlockEnd, findBracketBlockEnd } from "./blockEnd";

const JS_TS_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the 1-based line number for a given match index inside `content`. */
function lineOf(content: string, index: number): number {
  return content.substring(0, index).split("\n").length;
}

/**
 * Compute complexity + LOC metrics for the extracted symbol lines.
 * Mutates `symbol` in place.
 */
function enrichSymbol(symbol: CodeSymbol, lines: string[]): void {
  const symbolLines = lines.slice(symbol.startLine - 1, symbol.endLine);
  const text = symbolLines.join("\n");

  symbol.loc = symbolLines.filter((l) => l.trim().length > 0).length;

  const matches = text.match(/\b(if|for|while|catch|switch|case|&&|\|\||\?)\b/g);
  symbol.complexity = (matches?.length ?? 0) + 1;

  // Count function params (rough: look at the opening signature line)
  const sigLine = lines[symbol.startLine - 1] ?? "";
  const paramsMatch = sigLine.match(/\(([^)]*)\)/);
  if (paramsMatch && paramsMatch[1].trim()) {
    symbol.paramsCount = paramsMatch[1].split(",").length;
  } else {
    symbol.paramsCount = 0;
  }
}

/**
 * Walk backward from `startLine - 1` to extract a JSDoc / `//` comment block.
 */
function extractDocstring(lines: string[], startLine: number): string | undefined {
  const docLines: string[] = [];
  for (let j = startLine - 2; j >= 0; j--) {
    const line = lines[j].trim();
    if (line.endsWith("*/")) {
      for (let k = j; k >= 0; k--) {
        docLines.unshift(lines[k].trim());
        if (lines[k].trim().startsWith("/**")) break;
      }
      break;
    }
    if (!line.startsWith("//") && !line.startsWith("/*")) break;
    if (line.startsWith("//")) docLines.unshift(line);
  }
  return docLines.length ? docLines.join("\n") : undefined;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const jsTsAdapter: LanguageAdapter = {
  id: "jsTs",
  canAnalyzePath: (path) => JS_TS_EXT.some((ext) => path.toLowerCase().endsWith(ext)),

  extractImports: (content) => {
    const imports: string[] = [];

    // ES Modules: import ... from "x"  |  import "x" | export * from "x"
    for (const match of content.matchAll(
      /(?:(?:import|export)\s+[\s\S]*?\s+from\s+["'](.+?)["']|import\s+["'](.+?)["'])/g
    )) {
      imports.push(match[1] || match[2]);
    }

    // CommonJS: require("x")
    for (const match of content.matchAll(/require\s*\(\s*["'](.+?)["']\s*\)/g)) {
      imports.push(match[1]!);
    }

    return [...new Set(imports)].filter(Boolean);
  },

  extractSymbols: (content: string): CodeSymbol[] => {
    const raw: Array<Omit<CodeSymbol, "endLine" | "complexity" | "loc" | "paramsCount">> = [];
    const lines = content.split("\n");

    // ── 1. Classes ────────────────────────────────────────────────────────────
    for (const match of content.matchAll(
      /^\s*(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+([a-zA-Z0-9_$]+)/gm
    )) {
      raw.push({
        name: match[1]!,
        type: "class",
        startLine: lineOf(content, match.index!),
        isExported: match[0].includes("export"),
      });
    }

    // ── 2. Interfaces ─────────────────────────────────────────────────────────
    for (const match of content.matchAll(
      /^\s*(?:export\s+)?interface\s+([a-zA-Z0-9_$]+)/gm
    )) {
      raw.push({
        name: match[1]!,
        type: "interface",
        startLine: lineOf(content, match.index!),
        isExported: match[0].includes("export"),
      });
    }

    // ── 3. Named Functions ────────────────────────────────────────────────────
    for (const match of content.matchAll(
      /^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)/gm
    )) {
      raw.push({
        name: match[1]!,
        type: "function",
        startLine: lineOf(content, match.index!),
        isExported: match[0].includes("export"),
      });
    }

    // ── 4. React / Vue Components (PascalCase const arrow functions) ──────────
    //   export const MyComponent = (props) => { ... }
    //   export const MyComponent: React.FC = () => { ... }
    for (const match of content.matchAll(
      /^\s*(?:export\s+)?const\s+([A-Z][a-zA-Z0-9_$]*)\s*(?::\s*[^=]+)?\s*=\s*(?:React\.memo\s*\()?(?:\(|[a-zA-Z0-9_$]+)\s*(?::[^=]*)?\s*=>/gm
    )) {
      raw.push({
        name: match[1]!,
        type: "component",
        startLine: lineOf(content, match.index!),
        isExported: match[0].includes("export"),
      });
    }

    // ── 5. All other const/let function assignments (arrow or function keyword)
    for (const match of content.matchAll(
      /^\s*(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?(?:(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*(?::[^=]*)?\s*=>|function\b)/gm
    )) {
      raw.push({
        name: match[1]!,
        type: "function",
        startLine: lineOf(content, match.index!),
        isExported: match[0].includes("export"),
      });
    }

    // ── 6. HTTP Route Handlers ────────────────────────────────────────────────
    //   app.get("/path", handler)  |  router.post("/path", async (req, res) => {})
    for (const match of content.matchAll(
      /^\s*(?:[a-zA-Z_$][a-zA-Z0-9_$]*)\.(get|post|put|delete|patch|all|use)\s*\(\s*["'`]([^"'`]*?)["'`]/gm
    )) {
      const method = match[1]!.toUpperCase();
      const routePath = match[2]!;
      raw.push({
        name: `${method} ${routePath}`,
        type: "route",
        startLine: lineOf(content, match.index!),
      });
    }

    // ── 7. Class Methods ──────────────────────────────────────────────────────
    for (const match of content.matchAll(
      /^\s*(?:async\s+)?(?:public\s+|private\s+|protected\s+|static\s+)*([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/gm
    )) {
      const name = match[1]!;
      const skip = ["if", "for", "while", "switch", "try", "catch", "finally", "return", "constructor", "do"];
      if (skip.includes(name)) continue;
      // Avoid duplicate if already captured as function/component
      if (raw.some((s) => s.name === name)) continue;
      raw.push({
        name,
        type: "method",
        startLine: lineOf(content, match.index!),
      });
    }

    // ── 8. Logical Sections (Dividers) ────────────────────────────────────────
    // e.g. // --- Section Name --- or // ========================
    for (const match of content.matchAll(/^\s*\/\/\s*(?:─+|={3,}|-{3,}|#+)\s*([^─=\-#\n]+?)\s*(?:─+|={3,}|-{3,}|#+)?$/gm)) {
      raw.push({
        name: match[1]!.trim() || "Section",
        type: "heading",
        startLine: lineOf(content, match.index!),
      });
    }

    // ── 9. Export Blocks ──────────────────────────────────────────────────────
    // export { a, b, c }
    for (const match of content.matchAll(/^\s*export\s+\{([\s\S]*?)\}/gm)) {
      raw.push({
        name: "Export Block",
        type: "export",
        startLine: lineOf(content, match.index!),
      });
    }

    // ── Deduplicate by startLine (keep first match) ───────────────────────────
    const seen = new Map<number, true>();
    const deduped = raw.filter((s) => {
      if (seen.has(s.startLine)) return false;
      seen.set(s.startLine, true);
      return true;
    });

    // ── Resolve accurate endLines via brace-matching ──────────────────────────
    const symbols: CodeSymbol[] = deduped.map((s) => {
      let endLine: number;
      if (s.type === "heading") {
        // Heading ends at the next symbol or end of file - handled in chunker
        endLine = s.startLine; 
      } else if (s.type === "export" && !lines[s.startLine - 1].includes("{")) {
        endLine = s.startLine;
      } else if (s.type === "export" && lines[s.startLine - 1].includes("{")) {
        endLine = findBraceBlockEnd(lines, s.startLine);
      } else {
        endLine = findBraceBlockEnd(lines, s.startLine);
      }

      const sym: CodeSymbol = { ...s, endLine };
      enrichSymbol(sym, lines);
      sym.docstring = extractDocstring(lines, s.startLine);
      return sym;
    });

    // Sort by startLine
    return symbols.sort((a, b) => a.startLine - b.startLine);
  },

  resolveImport: ({ importPath, fromFile, filePathSet }) => {
    // Skip packages like "react", "@scope/pkg"
    if (!importPath.startsWith(".") && !importPath.startsWith("@/")) return null;

    const fromDir = fromFile.includes("/") ? fromFile.slice(0, fromFile.lastIndexOf("/")) : "";

    let resolvedBase = importPath;
    if (importPath.startsWith("@/")) {
      resolvedBase = "src/" + importPath.slice(2);
    } else if (importPath.startsWith(".")) {
      const joined = normalizePath(joinPaths(fromDir, importPath));
      resolvedBase = joined;
    }

    const tries = [
      "",
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".mjs",
      ".cjs",
      ".vue",
      "/index.ts",
      "/index.tsx",
      "/index.js",
      "/index.jsx",
      "/index.vue",
    ];

    for (const ext of tries) {
      const candidate = normalizePath(resolvedBase + ext);
      if (filePathSet.has(candidate)) return candidate;
    }

    return null;
  },
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
