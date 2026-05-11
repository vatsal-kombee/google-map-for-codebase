import type { LanguageAdapter } from "./types";
import { findBraceBlockEnd } from "./blockEnd";

export const rustAdapter: LanguageAdapter = {
    id: "rust",
    canAnalyzePath: (path) => path.toLowerCase().endsWith(".rs"),
    extractImports: (content) => {
        const imports: string[] = [];
        // use crate::foo::bar;  |  use super::foo;  |  use self::foo;
        for (const match of content.matchAll(/^\s*use\s+([\w:]+(?:::\{[^}]*\})?)\s*;/gm)) {
            // Normalize: take root path before {
            imports.push(match[1]!.replace(/\{[^}]*\}/, "").replace(/::$/, ""));
        }
        // mod foo;  (declares a submodule file)
        for (const match of content.matchAll(/^\s*mod\s+(\w+)\s*;/gm)) {
            imports.push("mod::" + match[1]!);
        }
        return [...new Set(imports)].filter(Boolean);
    },
    extractSymbols: (content: string) => {
        const symbols: any[] = [];
        const lines = content.split("\n");

        // 1. Functions
        for (const match of content.matchAll(/^\s*(?:pub\s+)?fn\s+([a-zA-Z0-9_$]+)/gm)) {
            const lineIndex = content.substring(0, match.index!).split("\n").length;
            symbols.push({ name: match[1], type: "function", startLine: lineIndex });
        }

        // 2. Structs
        for (const match of content.matchAll(/^\s*(?:pub\s+)?struct\s+([a-zA-Z0-9_$]+)/gm)) {
            const lineIndex = content.substring(0, match.index!).split("\n").length;
            symbols.push({ name: match[1], type: "struct", startLine: lineIndex });
        }

        // 3. Traits
        for (const match of content.matchAll(/^\s*(?:pub\s+)?trait\s+([a-zA-Z0-9_$]+)/gm)) {
            const lineIndex = content.substring(0, match.index!).split("\n").length;
            symbols.push({ name: match[1], type: "trait", startLine: lineIndex });
        }

        // 4. Impl blocks
        for (const match of content.matchAll(/^\s*impl(?:\s+([a-zA-Z0-9_$]+)\s+for)?\s+([a-zA-Z0-9_$]+)/gm)) {
            const lineIndex = content.substring(0, match.index!).split("\n").length;
            const name = match[1] ? `impl ${match[1]} for ${match[2]}` : `impl ${match[2]}`;
            symbols.push({ name, type: "impl", startLine: lineIndex });
        }

        // 5. Logical Sections (Dividers)
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
        const fromDir = fromFile.includes("/") ? fromFile.slice(0, fromFile.lastIndexOf("/")) : "";

        // mod::foo → sibling file foo.rs or foo/mod.rs
        if (importPath.startsWith("mod::")) {
            const name = importPath.slice(5);
            const candidates = [
                normalizePath(fromDir + "/" + name + ".rs"),
                normalizePath(fromDir + "/" + name + "/mod.rs")
            ];
            for (const c of candidates) if (filePathSet.has(c)) return c;
            return null;
        }

        // crate::foo::bar → src/foo/bar.rs or src/foo/bar/mod.rs
        const parts = importPath.replace(/^(crate|self|super)::/, "").split("::");
        const asPath = parts.join("/");
        for (const prefix of ["src/", ""]) {
            for (const suffix of [".rs", "/mod.rs"]) {
                const c = normalizePath(prefix + asPath + suffix);
                if (filePathSet.has(c)) return c;
            }
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
