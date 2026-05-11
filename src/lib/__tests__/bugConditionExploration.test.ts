/**
 * Bug Condition Exploration Tests — Task 1
 *
 * These tests are EXPECTED TO FAIL on unfixed code.
 * Failure confirms the three compounding defects exist:
 *   1. findFilesByQuery caps results at 4 regardless of module size
 *   2. findFilesByQuery has no directory-membership detection
 *   3. analyzeRepository returns only a status string, not file content
 *
 * DO NOT fix the code or the tests when they fail.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 */

import { describe, it, expect } from "vitest";
import { findFilesByQuery } from "../findFilesByQuery";

// ---------------------------------------------------------------------------
// Realistic file path lists mirroring the actual workspace src/ structure
// ---------------------------------------------------------------------------

const ALL_SRC_FILE_PATHS = [
    "src/hooks/useCopilotContext.ts",
    "src/hooks/useCopilotTools.ts",
    "src/hooks/useFullGraph.ts",
    "src/hooks/useRepository.ts",
    "src/lib/analyzers/dotnet.ts",
    "src/lib/analyzers/go.ts",
    "src/lib/analyzers/index.ts",
    "src/lib/analyzers/java.ts",
    "src/lib/analyzers/jsTs.ts",
    "src/lib/analyzers/php.ts",
    "src/lib/analyzers/python.ts",
    "src/lib/analyzers/rust.ts",
    "src/lib/analyzers/types.ts",
    "src/lib/fetchFileCached.ts",
    "src/lib/findFilesByQuery.ts",
    "src/lib/graph.ts",
    "src/lib/llmConfig.ts",
    "src/lib/octokit.ts",
    "src/lib/repoUrl.ts",
    "src/lib/tree.ts",
    "src/store/appStore.ts",
    "src/store/types.ts",
    "src/app/api/analyze/route.ts",
    "src/app/api/copilotkit/route.ts",
    "src/app/api/github/file/route.ts",
    "src/app/api/github/tree/route.ts",
    "src/app/api/local/file/route.ts",
    "src/app/api/local/tree/route.ts",
    "src/app/api/settings/route.ts",
    "src/components/AppShell.tsx",
    "src/components/panels/ChatPanel.tsx",
    "src/components/panels/CodeViewerPanel.tsx",
    "src/components/panels/GraphPanel.tsx",
    "src/components/panels/RepoExplorerPanel.tsx",
    "src/components/RepoLoader.tsx",
];

const HOOKS_FILE_PATHS = ALL_SRC_FILE_PATHS.filter((p) =>
    p.startsWith("src/hooks/")
);

const ANALYZER_FILE_PATHS = ALL_SRC_FILE_PATHS.filter((p) =>
    p.startsWith("src/lib/analyzers/")
);

const STORE_FILE_PATHS = ALL_SRC_FILE_PATHS.filter((p) =>
    p.startsWith("src/store/")
);

// ---------------------------------------------------------------------------
// Helper: simulate the analyzeRepository return value on unfixed code
// The unfixed handler always returns this status string — never file content.
// ---------------------------------------------------------------------------

function simulateAnalyzeRepositoryReturnValue(
    filePaths: string[],
    query: string
): string {
    // This mirrors the unfixed handler logic exactly:
    //   const relevantFiles = findFilesByQuery(filePaths, query, 4);
    //   ...
    //   return `Analyzed ${analyzed.length} file(s) and updated the graph.`;
    // We simulate "analyzed" as the files findFilesByQuery returns (no actual
    // fetch needed — the return value shape is what we are testing).
    const relevantFiles = findFilesByQuery(filePaths, query, 4);
    // The handler may further filter by adapter availability, but for the
    // purpose of testing the return value shape, the count is what matters.
    return `Analyzed ${relevantFiles.length} file(s) and updated the graph.`;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("Bug Condition Exploration — Module-Level Queries Return Too Few Files and No Content", () => {
    /**
     * Defect 1 + 2: findFilesByQuery with limit=4 returns fewer files than
     * exist in the analyzers module (9 files).
     *
     * EXPECTED TO FAIL on unfixed code: only 4 of 9 analyzer files are returned.
     *
     * Validates: Requirements 1.1, 1.2
     */
    it("findFilesByQuery returns ALL 9 analyzer files for 'how does the analyzers module work' (EXPECTED TO FAIL — cap=4 returns only 4)", () => {
        const result = findFilesByQuery(
            ANALYZER_FILE_PATHS,
            "how does the analyzers module work",
            4
        );

        // All 9 analyzer files should be returned for a module-level query
        expect(result).toHaveLength(ANALYZER_FILE_PATHS.length); // 9 files
        expect(result).toContain("src/lib/analyzers/dotnet.ts");
        expect(result).toContain("src/lib/analyzers/go.ts");
        expect(result).toContain("src/lib/analyzers/java.ts");
        expect(result).toContain("src/lib/analyzers/jsTs.ts");
        expect(result).toContain("src/lib/analyzers/php.ts");
        expect(result).toContain("src/lib/analyzers/python.ts");
        expect(result).toContain("src/lib/analyzers/rust.ts");
        expect(result).toContain("src/lib/analyzers/types.ts");
        expect(result).toContain("src/lib/analyzers/index.ts");
    });

    /**
     * Defect 2: findFilesByQuery against the full file list misses hooks files
     * that don't contain the query keyword in their name.
     *
     * With limit=4 against ALL_SRC_FILE_PATHS, the query "explain the hooks module"
     * must return all 4 hooks files. On unfixed code, the term-scoring may rank
     * non-hooks files higher or the cap may cut hooks files out.
     *
     * EXPECTED TO FAIL on unfixed code: directory-membership detection is absent,
     * so files like useFullGraph.ts and useRepository.ts may be missed when
     * competing with other files that also score on "hooks".
     *
     * Validates: Requirements 1.1, 1.2
     */
    it("findFilesByQuery returns ALL hooks files for 'explain the hooks module' against full file list (EXPECTED TO FAIL — no directory-membership detection)", () => {
        const result = findFilesByQuery(
            ALL_SRC_FILE_PATHS,
            "explain the hooks module",
            4
        );

        // All 4 hooks files must be present
        expect(result).toContain("src/hooks/useCopilotContext.ts");
        expect(result).toContain("src/hooks/useCopilotTools.ts");
        expect(result).toContain("src/hooks/useFullGraph.ts");
        expect(result).toContain("src/hooks/useRepository.ts");

        // No non-hooks files should be returned for a hooks module query
        const nonHooksFiles = result.filter((p) => !p.startsWith("src/hooks/"));
        expect(nonHooksFiles).toHaveLength(0);
    });

    /**
     * Defect 2: findFilesByQuery has no directory-membership detection.
     * For "explain the store module", the query term "store" appears in
     * src/store/appStore.ts (path contains "store" twice) but the function
     * has no concept of "return all files under src/store/".
     *
     * EXPECTED TO FAIL on unfixed code: no directory-membership detection means
     * the store module files may not all be returned, and non-store files that
     * happen to contain "store" in their path may be included instead.
     *
     * Validates: Requirements 1.2
     */
    it("findFilesByQuery returns ONLY store files for 'explain the store module' (EXPECTED TO FAIL — no directory-membership detection)", () => {
        const result = findFilesByQuery(
            ALL_SRC_FILE_PATHS,
            "explain the store module",
            4
        );

        // Both store files must be present
        expect(result).toContain("src/store/appStore.ts");
        expect(result).toContain("src/store/types.ts");

        // No non-store files should be returned for a store module query
        const nonStoreFiles = result.filter((p) => !p.startsWith("src/store/"));
        expect(nonStoreFiles).toHaveLength(0);
    });

    /**
     * Defect 3: analyzeRepository returns only a status string to the LLM.
     * The return value "Analyzed N file(s) and updated the graph." contains
     * no file content — the LLM cannot explain the module from this string.
     *
     * EXPECTED TO FAIL on unfixed code: the handler always returns the status
     * string, never file content or summaries.
     *
     * Validates: Requirements 1.3, 1.4
     */
    it("analyzeRepository return value for a module query contains actual file content, not just a status string (EXPECTED TO FAIL — returns status string only)", () => {
        const returnValue = simulateAnalyzeRepositoryReturnValue(
            ANALYZER_FILE_PATHS,
            "how does the analyzers module work"
        );

        // The return value must NOT be the bare status string
        expect(returnValue).not.toMatch(
            /^Analyzed \d+ file\(s\) and updated the graph\.$/
        );

        // The return value must contain actual file paths or content
        expect(returnValue).toMatch(/src\/lib\/analyzers\//);
    });

    /**
     * Combined defect: with limit=4 against the full file list, a hooks module
     * query fetches at most 4 files. The unfixed analyzeRepository handler
     * returns "Analyzed N file(s) and updated the graph." — the LLM receives
     * no code content.
     *
     * EXPECTED TO FAIL on unfixed code: return value is the bare status string.
     *
     * Validates: Requirements 1.1, 1.3, 1.4
     */
    it("analyzeRepository return value for 'explain the hooks module' contains file content (EXPECTED TO FAIL — returns status string only)", () => {
        const returnValue = simulateAnalyzeRepositoryReturnValue(
            ALL_SRC_FILE_PATHS,
            "explain the hooks module"
        );

        // Must not be the bare status string
        expect(returnValue).not.toMatch(
            /^Analyzed \d+ file\(s\) and updated the graph\.$/
        );

        // Must contain file path references so the LLM can reason about the code
        expect(returnValue).toMatch(/src\/hooks\//);
    });
});
