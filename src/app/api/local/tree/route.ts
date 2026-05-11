import { NextResponse } from "next/server";
import { z } from "zod";
import path from "path";
import fs from "fs";
import { buildTree, type GitHubTreeItem } from "@/lib/tree";

const QuerySchema = z.object({
    localPath: z.string().min(1)
});

// Files/folders to skip — mirrors common .gitignore patterns
const SKIP_DIRS = new Set([
    "node_modules",
    "vendor",
    ".git",
    ".next",
    "dist",
    "build",
    "out",
    ".cache",
    "cache",
    "storage/logs",
    "storage/framework/cache",
    "coverage",
    "__pycache__",
    ".venv",
    "venv",
    ".idea",
    ".vscode",
    ".cursor",
    ".antigravity",
    ".kiro",
    "tmp",
    "temp"
]);

const MAX_FILES = 25000;

function walkDir(dir: string, base: string, items: GitHubTreeItem[], count: { n: number }) {
    if (count.n >= MAX_FILES) return;

    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return; // permission denied or similar
    }

    for (const entry of entries) {
        if (count.n >= MAX_FILES) break;
        
        const abs = path.join(dir, entry.name);
        const rel = path.relative(base, abs).replace(/\\/g, "/");

        if (entry.name.startsWith(".") && entry.name !== ".env.example" && entry.name !== ".github") {
            if (entry.name !== ".git") { // Keep .git in SKIP_DIRS for consistency
                 // continue if it's a hidden file/folder we don't want
            }
        }

        // Check if the current name or the relative path is in SKIP_DIRS
        if (SKIP_DIRS.has(entry.name) || SKIP_DIRS.has(rel)) continue;

        if (entry.isDirectory()) {
            items.push({ path: rel, type: "tree" });
            walkDir(abs, base, items, count);
        } else if (entry.isFile()) {
            items.push({ path: rel, type: "blob" });
            count.n++;
        }
    }
}

export async function GET(req: Request) {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
        localPath: url.searchParams.get("localPath")
    });

    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid query", details: parsed.error.flatten() }, { status: 400 });
    }

    const localPath = parsed.data.localPath;

    // Security: only allow absolute paths that exist on the server
    if (!path.isAbsolute(localPath)) {
        return NextResponse.json({ error: "localPath must be an absolute path" }, { status: 400 });
    }

    if (!fs.existsSync(localPath)) {
        return NextResponse.json({ error: `Path does not exist: ${localPath}` }, { status: 404 });
    }

    const stat = fs.statSync(localPath);
    if (!stat.isDirectory()) {
        return NextResponse.json({ error: "localPath must point to a directory" }, { status: 400 });
    }

    const items: GitHubTreeItem[] = [];
    walkDir(localPath, localPath, items, { n: 0 });

    const tree = buildTree(items);
    const folderName = path.basename(localPath);

    return NextResponse.json({ folderName, localPath, tree });
}
