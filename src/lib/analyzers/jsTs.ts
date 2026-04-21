import type { LanguageAdapter } from "./types";

const JS_TS_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue"];

export const jsTsAdapter: LanguageAdapter = {
  id: "jsTs",
  canAnalyzePath: (path) => JS_TS_EXT.some((ext) => path.toLowerCase().endsWith(ext)),
  extractImports: (content) => {
    const imports: string[] = [];

    // ES Modules: import ... from "x"  |  import "x"
    for (const match of content.matchAll(
      /(?:import\s+[\s\S]*?\s+from\s+["'](.+?)["']|import\s+["'](.+?)["'])/g
    )) {
      imports.push(match[1] || match[2]);
    }

    // CommonJS: require("x")
    for (const match of content.matchAll(/require\s*\(\s*["'](.+?)["']\s*\)/g)) {
      imports.push(match[1]!);
    }

    return [...new Set(imports)].filter(Boolean);
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
      "/index.vue"
    ];

    for (const ext of tries) {
      const candidate = normalizePath(resolvedBase + ext);
      if (filePathSet.has(candidate)) return candidate;
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

