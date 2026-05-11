import { describe, it, expect } from "vitest";
import { jsTsAdapter } from "../analyzers/jsTs";
import { pythonAdapter } from "../analyzers/python";
import { chunkFile } from "../chunker";

describe("Language Symbol Extraction", () => {
  it("extracts symbols from TypeScript", () => {
    const code = `
      export interface User { id: number; }
      export class AuthService {
        /** Login user */
        async login(u: string) { return u; }
      }
      const helper = () => { return 1; };
    `;
    const symbols = jsTsAdapter.extractSymbols!(code);
    expect(symbols).toContainEqual(expect.objectContaining({ name: "User", type: "interface" }));
    expect(symbols).toContainEqual(expect.objectContaining({ name: "AuthService", type: "class" }));
    expect(symbols).toContainEqual(expect.objectContaining({ name: "login", type: "method" }));
    expect(symbols).toContainEqual(expect.objectContaining({ name: "helper", type: "function" }));
    
    const authService = symbols.find(s => s.name === "AuthService");
    expect(authService?.endLine).toBeGreaterThanOrEqual(authService?.startLine || 0);
  });

  it("extracts symbols and docstrings from Python", () => {
    const code = `
class Database:
    """Handles DB ops"""
    def connect(self):
        pass

def top_level():
    pass
    `;
    const symbols = pythonAdapter.extractSymbols!(code);
    expect(symbols).toContainEqual(expect.objectContaining({ name: "Database", type: "class" }));
    expect(symbols).toContainEqual(expect.objectContaining({ name: "connect", type: "function" }));
    expect(symbols).toContainEqual(expect.objectContaining({ name: "top_level", type: "function" }));
    
    const db = symbols.find(s => s.name === "Database");
    expect(db?.docstring).toContain("Handles DB ops");
  });
});

describe("Intelligent Chunking", () => {
  it("chunks based on symbol boundaries", () => {
    const code = `// header gap
function first() {
  // line 3
  // line 4
}
// mid gap
function second() {
  // line 8
}
// footer gap`;
    const symbols = [
      { name: "first", type: "function", startLine: 2, endLine: 5 },
      { name: "second", type: "function", startLine: 7, endLine: 9 }
    ] as any;
    
    const chunks = chunkFile("test.ts", code, symbols);
    
    // Should have: gap1, first, gap2, second, gap3
    expect(chunks.length).toBe(5);
    expect(chunks[1].symbolName).toBe("first");
    expect(chunks[1].startLine).toBe(2);
    expect(chunks[1].endLine).toBe(5);
    
    expect(chunks[3].symbolName).toBe("second");
    expect(chunks[3].startLine).toBe(7);
    expect(chunks[3].endLine).toBe(9);
  });
});
