import type { LanguageAdapter } from "./types";

export const dotnetAdapter: LanguageAdapter = {
  id: "dotnet",
  canAnalyzePath: (path) => path.toLowerCase().endsWith(".cs"),
  extractImports: (content) => {
    // NOTE: `using Namespace;` doesn't map 1:1 to files without csproj context.
    const imports: string[] = [];
    for (const match of content.matchAll(/^\s*using\s+([A-Za-z0-9_.]+)\s*;\s*$/gm)) {
      imports.push(match[1]!);
    }
    return [...new Set(imports)];
  },
  resolveImport: () => {
    // Placeholder: proper .NET resolution needs .sln/.csproj + compile includes + project refs
    return null;
  }
};

