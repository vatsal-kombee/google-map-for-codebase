import { NextResponse } from "next/server";
import { z } from "zod";
import path from "path";
import fs from "fs";
import { getOctokit } from "@/lib/octokit";
import { languageAdapters } from "@/lib/analyzers";

// ── Schema ────────────────────────────────────────────────────────────────────

const BodySchema = z.discriminatedUnion("mode", [
    z.object({
        mode: z.literal("github"),
        owner: z.string().min(1),
        repo: z.string().min(1),
        branch: z.string().min(1),
        filePaths: z.array(z.string()).max(5000)
    }),
    z.object({
        mode: z.literal("local"),
        localPath: z.string().min(1),
        filePaths: z.array(z.string()).max(5000)
    })
]);

// ── Types ─────────────────────────────────────────────────────────────────────

export type GraphNode = {
    id: string;
    label: string;
    fullPath: string;
    /** Number of files that import this file */
    inDegree: number;
    /** Number of files this file imports */
    outDegree: number;
    language: string;
};

export type GraphEdge = {
    id: string;
    source: string;
    target: string;
};

export type AnalyzeResponse = {
    nodes: GraphNode[];
    edges: GraphEdge[];
    skipped: number; // files with no adapter or failed to fetch
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 512 * 1024; // 512 KB per file
const CONCURRENCY = 40;

async function fetchBatch<T>(
    items: T[],
    fn: (item: T) => Promise<string | null>,
    concurrency: number
): Promise<(string | null)[]> {
    const results: (string | null)[] = new Array(items.length).fill(null);
    let idx = 0;
    async function worker() {
        while (idx < items.length) {
            const i = idx++;
            try {
                results[i] = await fn(items[i]!);
            } catch {
                results[i] = null;
            }
        }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    return results;
}

function getLanguage(filePath: string): string {
    const adapter = languageAdapters.find((a) => a.canAnalyzePath(filePath));
    return adapter?.id ?? "unknown";
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
    }

    const body = parsed.data;

    // Only analyze files that have a language adapter
    const analyzable = body.filePaths.filter((p) => languageAdapters.some((a) => a.canAnalyzePath(p)));
    const filePathSet = new Set(body.filePaths);

    // ── Fetch all file contents ──────────────────────────────────────────────

    let contents: (string | null)[];

    if (body.mode === "github") {
        const octokit = getOctokit();
        contents = await fetchBatch(analyzable, async (filePath) => {
            const { data } = await octokit.repos.getContent({
                owner: body.owner,
                repo: body.repo,
                path: filePath,
                ref: body.branch
            });
            if (Array.isArray(data) || data.type !== "file") return null;
            const raw = Buffer.from(data.content ?? "", "base64");
            if (raw.length > MAX_FILE_BYTES) return null;
            return raw.toString("utf-8");
        }, CONCURRENCY);
    } else {
        // local mode
        if (!path.isAbsolute(body.localPath)) {
            return NextResponse.json({ error: "localPath must be absolute" }, { status: 400 });
        }
        contents = await fetchBatch(analyzable, async (filePath) => {
            const resolved = path.resolve(body.localPath, filePath);
            if (!resolved.startsWith(path.resolve(body.localPath))) return null; // traversal guard
            const stat = fs.statSync(resolved);
            if (stat.size > MAX_FILE_BYTES) return null;
            return fs.readFileSync(resolved, "utf-8");
        }, CONCURRENCY);
    }

    // ── Extract imports & build graph ────────────────────────────────────────

    let skipped = 0;
    const fileImports: { path: string; imports: string[] }[] = [];

    for (let i = 0; i < analyzable.length; i++) {
        const filePath = analyzable[i]!;
        const content = contents[i];
        if (!content) { skipped++; continue; }

        const adapter = languageAdapters.find((a) => a.canAnalyzePath(filePath))!;
        const rawImports = adapter.extractImports(content);

        const resolved = rawImports
            .map((imp) => adapter.resolveImport({ importPath: imp, fromFile: filePath, filePathSet }))
            .filter((r): r is string => r !== null);

        fileImports.push({ path: filePath, imports: resolved });
    }

    // ── Build node/edge sets ─────────────────────────────────────────────────

    // Nodes = all files that appear as source OR target of at least one edge,
    // plus all analyzed files (even isolated ones)
    const nodeIds = new Set<string>(fileImports.map((f) => f.path));
    const edges: GraphEdge[] = [];
    let eid = 0;

    const inDegree = new Map<string, number>();
    const outDegree = new Map<string, number>();

    for (const f of fileImports) {
        for (const target of f.imports) {
            // Only include edges where target is a known project file
            if (!filePathSet.has(target)) continue;
            nodeIds.add(target);
            edges.push({ id: `e-${eid++}`, source: f.path, target });
            outDegree.set(f.path, (outDegree.get(f.path) ?? 0) + 1);
            inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
        }
    }

    const nodes: GraphNode[] = [...nodeIds].map((id) => ({
        id,
        label: id.split("/").pop() ?? id,
        fullPath: id,
        inDegree: inDegree.get(id) ?? 0,
        outDegree: outDegree.get(id) ?? 0,
        language: getLanguage(id)
    }));

    return NextResponse.json({ nodes, edges, skipped } satisfies AnalyzeResponse);
}
