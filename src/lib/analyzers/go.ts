import type { LanguageAdapter } from "./types";
import { findBraceBlockEnd } from "./blockEnd";

export const goAdapter: LanguageAdapter = {
    id: "go",
    canAnalyzePath: (path) => path.toLowerCase().endsWith(".go"),
    extractImports: (content) => {
        const imports: string[] = [];
        // Single: import "pkg/path"
        for (const match of content.matchAll(/^\s*import\s+"([^"]+)"/gm)) {
            imports.push(match[1]!);
        }
        // Block: import ( "pkg" \n "pkg2" )
        const blockMatch = content.match(/import\s*\(([\s\S]*?)\)/);
        if (blockMatch) {
            for (const m of blockMatch[1]!.matchAll(/"([^"]+)"/g)) {
                imports.push(m[1]!);
            }
        }
        return [...new Set(imports)].filter(Boolean);
    },
    extractSymbols: (content: string) => {
        const symbols: any[] = [];
        const lines = content.split("\n");

        // 1. Functions
        for (const match of content.matchAll(/^\s*func\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_$]+)/gm)) {
            const lineIndex = content.substring(0, match.index!).split("\n").length;
            symbols.push({ name: match[1], type: "function", startLine: lineIndex });
        }

        // 2. Structs
        for (const match of content.matchAll(/^\s*type\s+([a-zA-Z0-9_$]+)\s+struct/gm)) {
            const lineIndex = content.substring(0, match.index!).split("\n").length;
            symbols.push({ name: match[1], type: "struct", startLine: lineIndex });
        }

        // 3. Interfaces
        for (const match of content.matchAll(/^\s*type\s+([a-zA-Z0-9_$]+)\s+interface/gm)) {
            const lineIndex = content.substring(0, match.index!).split("\n").length;
            symbols.push({ name: match[1], type: "interface", startLine: lineIndex });
        }

        // Sort and resolve accurate endLines via brace-matching
        symbols.sort((a, b) => a.startLine - b.startLine);
        for (const s of symbols) {
            s.endLine = findBraceBlockEnd(lines, s.startLine);
        }

        return symbols;
    },
    resolveImport: ({ importPath, filePathSet }) => {
        // Go imports are module paths. Match last segment(s) against file paths.
        const parts = importPath.split("/");
        // Try progressively shorter suffix matches
        for (let i = 0; i < parts.length; i++) {
            const suffix = parts.slice(i).join("/");
            for (const fp of filePathSet) {
                if (fp.startsWith(suffix + "/") || fp === suffix + ".go") return fp;
            }
        }
        return null;
    }
};
