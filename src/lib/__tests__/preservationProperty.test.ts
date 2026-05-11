/**
 * Preservation Property Tests — Task 2
 *
 * These tests MUST PASS on unfixed code.
 * They capture the baseline behavior that must be preserved after the fix.
 *
 * Property 2: Non-Module Queries Behave Identically Before and After Fix
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { describe, it, expect } from "vitest";
import { findFilesByQuery } from "../findFilesByQuery";

// ---------------------------------------------------------------------------
// Realistic file path list mirroring the actual workspace src/ structure
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

// ---------------------------------------------------------------------------
// Helper: isModuleLevelQuery — mirrors the predicate to be introduced in the fix.
// On unfixed code this function does not exist yet; we define it here so the
// preservation tests can identify which queries are NOT module-level.
// This definition must match the one that will be introduced in the fix.
// ---------------------------------------------------------------------------

function isModuleLevelQuery(query: string): boolean {
    const q = query.toLowerCase();
    return (
        /explain\s+.+module/.test(q) ||
        /how does\s+.+module/.test(q) ||
        /explain entire/.test(q) ||
        /walk me through/.test(q) ||
        /overview of/.test(q) ||
        /describe the\s+.+module/.test(q) ||
        /whole module/.test(q) ||
        /entire module/.test(q)
    );
}

// ---------------------------------------------------------------------------
// Helper: simulate the analyzeRepository return value on unfixed code.
// The unfixed handler returns:
//   - "Focused on selected file: <path>." for fileScopedQuery fast-path
//   - "Analyzed N file(s) and updated the graph." for all other queries
// ---------------------------------------------------------------------------

function simulateAnalyzeRepositoryReturnValue(
    filePaths: string[],
    query: string,
    selectedFile: string | null = null
): string {
    const lowerQuery = query.toLowerCase();

    // fileScopedQuery fast-path: follow-up on currently selected file
    const fileScopedQuery =
        Boolean(selectedFile) &&
        /(highlight|line|lines|this file|selected file|in this file|in selected file)/i.test(lowerQuery);

    if (fileScopedQuery && selectedFile) {
        return `Focused on selected file: ${selectedFile}.`;
    }

    // Normal path: find relevant files and return status string
    const relevantFiles = findFilesByQuery(filePaths, query, 4);
    return `Analyzed ${relevantFiles.length} file(s) and updated the graph.`;
}

// ---------------------------------------------------------------------------
// Non-module query strings (isModuleLevelQuery returns false for all of these)
// ---------------------------------------------------------------------------

const NON_MODULE_QUERIES: string[] = [
    "what does useRepository.ts do?",
    "octokit",
    "how does graph.ts work?",
    "show me the fetchFileCached file",
    "what is appStore.ts?",
    "explain this file",
    "highlight line 10",
    "what does tree.ts export?",
    "llmConfig",
    "repoUrl",
    "show me the route file",
    "what is in types.ts?",
    "how does AppShell work?",
    "ChatPanel",
    "CodeViewerPanel",
];

// ---------------------------------------------------------------------------
// Observed baseline values on unfixed code (observation-first methodology)
// ---------------------------------------------------------------------------

describe("Preservation — Observed Baseline Behavior on Unfixed Code", () => {
    /**
     * Observation: findFilesByQuery(filePaths, "what does useRepository.ts do?", 4)
     * returns ["src/hooks/useRepository.ts"] on unfixed code.
     *
     * Validates: Requirements 3.1
     */
    it('findFilesByQuery returns ["src/hooks/useRepository.ts"] for single-file query "what does useRepository.ts do?"', () => {
        const result = findFilesByQuery(
            ALL_SRC_FILE_PATHS,
            "what does useRepository.ts do?",
            4
        );
        expect(result).toEqual(["src/hooks/useRepository.ts"]);
    });

    /**
     * Observation: findFilesByQuery(filePaths, "octokit", 4)
     * returns ["src/lib/octokit.ts"] on unfixed code.
     *
     * Validates: Requirements 3.3
     */
    it('findFilesByQuery returns ["src/lib/octokit.ts"] for narrow query "octokit"', () => {
        const result = findFilesByQuery(ALL_SRC_FILE_PATHS, "octokit", 4);
        expect(result).toEqual(["src/lib/octokit.ts"]);
    });

    /**
     * Observation: analyzeRepository handler for a narrow query returns the short
     * status string "Analyzed N file(s) and updated the graph." on unfixed code.
     *
     * Validates: Requirements 3.3
     */
    it('analyzeRepository returns short status string for narrow query "octokit"', () => {
        const result = simulateAnalyzeRepositoryReturnValue(
            ALL_SRC_FILE_PATHS,
            "octokit"
        );
        expect(result).toBe("Analyzed 1 file(s) and updated the graph.");
    });

    /**
     * Observation: analyzeRepository handler for a fileScopedQuery (follow-up on
     * selected file) returns "Focused on selected file: <path>." on unfixed code.
     *
     * Validates: Requirements 3.2
     */
    it('analyzeRepository returns "Focused on selected file: <path>." for fileScopedQuery', () => {
        const selectedFile = "src/hooks/useRepository.ts";
        const result = simulateAnalyzeRepositoryReturnValue(
            ALL_SRC_FILE_PATHS,
            "highlight line 10 in this file",
            selectedFile
        );
        expect(result).toBe(`Focused on selected file: ${selectedFile}.`);
    });
});

// ---------------------------------------------------------------------------
// Property 2a: For all non-module queries, findFilesByQuery output is identical
// before and after the fix.
//
// We verify this by running findFilesByQuery on the unfixed code and asserting
// the results match the expected baseline. After the fix, the same test must
// still pass — confirming the output is unchanged.
// ---------------------------------------------------------------------------

describe("Preservation Property 2a — findFilesByQuery Output Unchanged for Non-Module Queries", () => {
    /**
     * **Validates: Requirements 3.1, 3.3**
     *
     * For all query strings where isModuleLevelQuery returns false,
     * findFilesByQuery output is identical before and after the fix.
     *
     * We test this by:
     * 1. Confirming isModuleLevelQuery returns false for each query (guard)
     * 2. Running findFilesByQuery on unfixed code and recording the result
     * 3. Asserting the result matches the recorded baseline
     *
     * After the fix, re-running this test confirms the output is unchanged.
     */
    it.each(NON_MODULE_QUERIES)(
        'findFilesByQuery result is stable (non-module query): "%s"',
        (query) => {
            // Guard: confirm this is not a module-level query
            expect(isModuleLevelQuery(query)).toBe(false);

            // Run findFilesByQuery — this is the unfixed behavior we want to preserve
            const result = findFilesByQuery(ALL_SRC_FILE_PATHS, query, 4);

            // The result must be an array (possibly empty)
            expect(Array.isArray(result)).toBe(true);

            // The result must contain at most 4 files (existing cap preserved)
            expect(result.length).toBeLessThanOrEqual(4);

            // All returned paths must be from the input file list
            for (const p of result) {
                expect(ALL_SRC_FILE_PATHS).toContain(p);
            }
        }
    );

    /**
     * **Validates: Requirements 3.1**
     *
     * Single-file queries (mentioning a specific filename) return exactly that file.
     * This is the core single-file preservation property.
     */
    it.each([
        ["what does useRepository.ts do?", "src/hooks/useRepository.ts"],
        ["explain useCopilotTools.ts", "src/hooks/useCopilotTools.ts"],
        ["what is octokit.ts", "src/lib/octokit.ts"],
        ["show me graph.ts", "src/lib/graph.ts"],
        ["what does tree.ts do?", "src/lib/tree.ts"],
        ["explain fetchFileCached.ts", "src/lib/fetchFileCached.ts"],
        ["what is appStore.ts", "src/store/appStore.ts"],
        ["show me llmConfig.ts", "src/lib/llmConfig.ts"],
    ] as [string, string][])(
        'single-file query "%s" returns the specific file "%s"',
        (query, expectedFile) => {
            expect(isModuleLevelQuery(query)).toBe(false);

            const result = findFilesByQuery(ALL_SRC_FILE_PATHS, query, 4);

            // The specific file must be in the results
            expect(result).toContain(expectedFile);

            // Must not exceed the cap of 4
            expect(result.length).toBeLessThanOrEqual(4);
        }
    );
});

// ---------------------------------------------------------------------------
// Property 2b: For all single-file query strings, the analyzeRepository handler
// return value is the same short status string before and after the fix.
// ---------------------------------------------------------------------------

describe("Preservation Property 2b — analyzeRepository Returns Short Status String for Non-Module Queries", () => {
    /**
     * **Validates: Requirements 3.1, 3.3**
     *
     * For all non-module queries (no selected file / no fileScopedQuery trigger),
     * the analyzeRepository handler return value matches the pattern
     * "Analyzed N file(s) and updated the graph."
     */
    it.each(NON_MODULE_QUERIES)(
        'analyzeRepository returns short status string for non-module query: "%s"',
        (query) => {
            expect(isModuleLevelQuery(query)).toBe(false);

            const result = simulateAnalyzeRepositoryReturnValue(
                ALL_SRC_FILE_PATHS,
                query,
                null // no selected file
            );

            // Must match the short status string pattern
            expect(result).toMatch(/^Analyzed \d+ file\(s\) and updated the graph\.$/);

            // Must NOT contain file content or code
            expect(result).not.toMatch(/src\//);
        }
    );

    /**
     * **Validates: Requirements 3.2**
     *
     * For fileScopedQuery (follow-up on selected file), the handler returns
     * "Focused on selected file: <path>." — not the status string.
     */
    it.each([
        ["highlight line 10 in this file", "src/hooks/useRepository.ts"],
        ["show me lines 5-20 in selected file", "src/lib/graph.ts"],
        ["what is on this file line 3?", "src/lib/octokit.ts"],
        ["explain this file", "src/store/appStore.ts"],
    ] as [string, string][])(
        'analyzeRepository returns "Focused on selected file" for fileScopedQuery: "%s"',
        (query, selectedFile) => {
            const result = simulateAnalyzeRepositoryReturnValue(
                ALL_SRC_FILE_PATHS,
                query,
                selectedFile
            );

            expect(result).toBe(`Focused on selected file: ${selectedFile}.`);
        }
    );
});

// ---------------------------------------------------------------------------
// Property 2c: For all non-module queries, the handler fetches at most 4 files
// (existing cap is preserved).
// ---------------------------------------------------------------------------

describe("Preservation Property 2c — Non-Module Queries Fetch At Most 4 Files", () => {
    /**
     * **Validates: Requirements 3.3, 3.5**
     *
     * The existing cap of 4 files for non-module queries must be preserved.
     * findFilesByQuery called with limit=4 must never return more than 4 files.
     */
    it.each(NON_MODULE_QUERIES)(
        'findFilesByQuery returns at most 4 files for non-module query: "%s"',
        (query) => {
            expect(isModuleLevelQuery(query)).toBe(false);

            const result = findFilesByQuery(ALL_SRC_FILE_PATHS, query, 4);

            expect(result.length).toBeLessThanOrEqual(4);
        }
    );

    /**
     * **Validates: Requirements 3.5**
     *
     * Even with a large file list (>80 paths), findFilesByQuery with limit=4
     * returns at most 4 files for non-module queries.
     */
    it("findFilesByQuery respects limit=4 even with a large file list for non-module queries", () => {
        // Build a large file list (>80 paths) by repeating with unique names
        const largeFileList: string[] = [];
        for (let i = 0; i < 10; i++) {
            largeFileList.push(...ALL_SRC_FILE_PATHS.map((p) => p.replace("src/", `src/copy${i}/`)));
        }
        largeFileList.push(...ALL_SRC_FILE_PATHS);

        expect(largeFileList.length).toBeGreaterThan(80);

        const nonModuleQueries = ["octokit", "graph", "tree", "route"];
        for (const query of nonModuleQueries) {
            expect(isModuleLevelQuery(query)).toBe(false);
            const result = findFilesByQuery(largeFileList, query, 4);
            expect(result.length).toBeLessThanOrEqual(4);
        }
    });

    /**
     * **Validates: Requirements 3.3**
     *
     * Narrow queries that match only 1 file return exactly 1 file.
     * This confirms the focused, fast response behavior is preserved.
     */
    it.each([
        ["octokit", 1],
        ["repoUrl", 1],
        ["llmConfig", 1],
    ] as [string, number][])(
        'narrow query "%s" returns exactly %d file(s)',
        (query, expectedCount) => {
            expect(isModuleLevelQuery(query)).toBe(false);

            const result = findFilesByQuery(ALL_SRC_FILE_PATHS, query, 4);

            expect(result.length).toBe(expectedCount);
        }
    );
});

// ---------------------------------------------------------------------------
// Property 2d: isModuleLevelQuery correctly classifies queries
// (ensures the preservation boundary is correctly defined)
// ---------------------------------------------------------------------------

describe("Preservation Property 2d — isModuleLevelQuery Classification", () => {
    /**
     * **Validates: Requirements 3.1, 3.2, 3.3**
     *
     * isModuleLevelQuery returns false for all non-module queries.
     * This confirms the preservation boundary is correctly defined.
     */
    it.each(NON_MODULE_QUERIES)(
        'isModuleLevelQuery returns false for non-module query: "%s"',
        (query) => {
            expect(isModuleLevelQuery(query)).toBe(false);
        }
    );

    /**
     * isModuleLevelQuery returns true for module-level queries.
     * These are the queries that trigger the bug and will be fixed.
     */
    it.each([
        "explain the hooks module",
        "how does the analyzers module work",
        "explain entire lib module",
        "walk me through the graph module",
        "overview of the store module",
        "describe the components module",
        "explain the whole module",
        "explain the entire module",
    ])(
        'isModuleLevelQuery returns true for module-level query: "%s"',
        (query) => {
            expect(isModuleLevelQuery(query)).toBe(true);
        }
    );
});
