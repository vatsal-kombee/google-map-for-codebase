import type { LanguageAdapter, CodeSymbol } from "./types";
import { findIndentBlockEnd } from "./blockEnd";

export const pythonAdapter: LanguageAdapter = {
    id: "python" as any,
    canAnalyzePath: (path) => path.toLowerCase().endsWith(".py"),
    extractImports: (content) => {
        const imports: string[] = [];
        // import foo.bar  |  import foo.bar as baz
        for (const match of content.matchAll(/^\s*import\s+([\w.]+)/gm)) {
            imports.push(match[1]!);
        }
        // from foo.bar import baz  |  from .foo import bar  |  from ..foo import bar
        for (const match of content.matchAll(/^\s*from\s+(\.{0,2}[\w.]*)\s+import\s+/gm)) {
            imports.push(match[1]!);
        }
        return [...new Set(imports)].filter(Boolean);
    },
    extractSymbols: (content: string): CodeSymbol[] => {
        const raw: Array<{ name: string; type: CodeSymbol["type"]; startLine: number; isExported?: boolean }> = [];
        const lines = content.split("\n");

        // 1. Classes
        for (const match of content.matchAll(/^\s*class\s+([a-zA-Z0-9_$]+)/gm)) {
            const lineIndex = content.substring(0, match.index!).split("\n").length;
            raw.push({ name: match[1]!, type: "class", startLine: lineIndex });
        }

        // 2. Functions / Methods (including async def)
        for (const match of content.matchAll(/^\s*(?:async\s+)?def\s+([a-zA-Z0-9_$]+)/gm)) {
            const lineIndex = content.substring(0, match.index!).split("\n").length;
            raw.push({ name: match[1]!, type: "function", startLine: lineIndex });
        }

        // 3. Logical Sections (Dividers)
        for (const match of content.matchAll(/^\s*# (?:─+|={3,}|-{3,}|#+)\s*([^─=\-#\n]+?)\s*(?:─+|={3,}|-{3,}|#+)?$/gm)) {
            const lineIndex = content.substring(0, match.index!).split("\n").length;
            raw.push({ name: match[1]!.trim() || "Section", type: "heading", startLine: lineIndex });
        }

        // Deduplicate by startLine
        const seen = new Map<number, true>();
        const deduped = raw.filter((s) => {
            if (seen.has(s.startLine)) return false;
            seen.set(s.startLine, true);
            return true;
        });

        // Sort and resolve accurate endLines via indentation tracking
        deduped.sort((a, b) => a.startLine - b.startLine);

        const symbols: CodeSymbol[] = deduped.map((s) => {
            const endLine = findIndentBlockEnd(lines, s.startLine);
            const symbolLines = lines.slice(s.startLine - 1, endLine);
            const text = symbolLines.join("\n");

            const loc = symbolLines.filter((l) => l.trim().length > 0).length;
            const matches = text.match(/\b(if|for|while|except|elif|and|or)\b/g);
            const complexity = (matches?.length ?? 0) + 1;

            // Python docstrings (look for """ or ''' on the lines immediately following the def/class)
            let docLines: string[] = [];
            const startIdx = s.startLine; // 0-based index into lines array
            for (let j = startIdx; j < Math.min(startIdx + 5, lines.length); j++) {
                const line = lines[j].trim();
                if (line.startsWith('"""') || line.startsWith("'''")) {
                    for (let k = j; k < lines.length; k++) {
                        docLines.push(lines[k].trim());
                        if (k > j && (lines[k].trim().endsWith('"""') || lines[k].trim().endsWith("'''"))) break;
                    }
                    break;
                }
            }

            return {
                name: s.name,
                type: s.type,
                startLine: s.startLine,
                endLine,
                isExported: s.isExported,
                loc,
                complexity,
                docstring: docLines.length ? docLines.join("\n") : undefined,
            };
        });

        return symbols;
    },
    resolveImport: ({ importPath, fromFile, filePathSet }) => {
        const fromDir = fromFile.includes("/") ? fromFile.slice(0, fromFile.lastIndexOf("/")) : "";

        // Relative imports: .foo or ..foo
        if (importPath.startsWith(".")) {
            const dots = importPath.match(/^\.+/)?.[0].length ?? 1;
            const rest = importPath.replace(/^\.+/, "").replace(/\./g, "/");
            let base = fromDir;
            for (let i = 1; i < dots; i++) {
                base = base.includes("/") ? base.slice(0, base.lastIndexOf("/")) : "";
            }
            const candidate = normalizePath((base ? base + "/" : "") + rest);
            for (const t of [candidate + ".py", candidate + "/__init__.py"]) {
                if (filePathSet.has(t)) return t;
            }
            return null;
        }

        // Absolute: map dots to slashes, look for file or package __init__
        const asPath = importPath.replace(/\./g, "/");
        for (const t of [asPath + ".py", asPath + "/__init__.py"]) {
            if (filePathSet.has(t)) return t;
        }
        // Try under src/
        for (const t of ["src/" + asPath + ".py", "src/" + asPath + "/__init__.py"]) {
            if (filePathSet.has(t)) return t;
        }
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
