import { describe, expect, it } from "vitest";
import { buildCodeIndex, retrieveRelevantChunks } from "../codeIndex";
import type { IndexedChunk } from "../codeIndex";

const chunks: IndexedChunk[] = [
  {
    path: "src/auth/login.ts",
    index: 0,
    startLine: 1,
    endLine: 4,
    text: "export async function loginUser() { validateCredentials(); createSession(); }",
    symbolName: "loginUser",
    symbolType: "function",
    complexity: 4,
    embedding: [1, 0],
  },
  {
    path: "src/db/connect.ts",
    index: 1,
    startLine: 1,
    endLine: 4,
    text: "export function connectDb() { return pool.connect(); }",
    symbolName: "connectDb",
    symbolType: "function",
    complexity: 2,
    embedding: [0, 1],
  },
];

describe("retrieveRelevantChunks", () => {
  it("prefers semantic ranking when a query embedding is provided", () => {
    const index = buildCodeIndex(chunks);

    const results = retrieveRelevantChunks(index, {
      query: "how does login work",
      queryEmbedding: [1, 0],
      limit: 1,
    });

    expect(results).toHaveLength(1);
    expect(results[0].strategy).toBe("semantic");
    expect(results[0].path).toBe("src/auth/login.ts");
    expect(results[0].text).toContain("createSession");
  });

  it("falls back to bm25 when no query embedding is provided", () => {
    const index = buildCodeIndex(chunks);

    const results = retrieveRelevantChunks(index, {
      query: "connectDb",
      limit: 1,
    });

    expect(results).toHaveLength(1);
    expect(results[0].strategy).toBe("bm25");
    expect(results[0].path).toBe("src/db/connect.ts");
  });
});
