import type { LanguageAdapter } from "./types";
import { findBraceBlockEnd } from "./blockEnd";

export const javaAdapter: LanguageAdapter = {
    id: "java",
    canAnalyzePath: (path) => path.toLowerCase().endsWith(".java") || path.toLowerCase().endsWith(".kt"),
    extractImports: (content) => {
        const imports: string[] = [];
        for (const match of content.matchAll(/^\s*import\s+(?:static\s+)?([\w.]+)\s*;/gm)) {
            imports.push(match[1]!);
        }
        return [...new Set(imports)].filter(Boolean);
    },
    extractSymbols: (content: string) => {
        const symbols: any[] = [];
        const lines = content.split("\n");

        // 1. Classes
        for (const match of content.matchAll(/^\s*(?:public\s+|private\s+|protected\s+)?(?:abstract\s+)?class\s+([a-zA-Z0-9_$]+)/gm)) {
            const lineIndex = content.substring(0, match.index!).split("\n").length;
            symbols.push({ name: match[1], type: "class", startLine: lineIndex });
        }

        // 2. Methods
        for (const match of content.matchAll(/^\s*(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:[a-zA-Z0-9_$<>\[\]]+\s+)+([a-zA-Z0-9_$]+)\s*\(/gm)) {
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
    resolveImport: ({ importPath, filePathSet }) => {
        // com.example.Foo → com/example/Foo.java or .kt
        const asPath = importPath.replace(/\./g, "/");
        for (const ext of [".java", ".kt"]) {
            const candidate = asPath + ext;
            if (filePathSet.has(candidate)) return candidate;
            // Try under src/main/java or src/
            for (const prefix of ["src/main/java/", "src/main/kotlin/", "src/"]) {
                if (filePathSet.has(prefix + candidate)) return prefix + candidate;
            }
        }
        return null;
    }
};
