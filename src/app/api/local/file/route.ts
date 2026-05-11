import { NextResponse } from "next/server";
import { z } from "zod";
import path from "path";
import fs from "fs";

const QuerySchema = z.object({
    localPath: z.string().min(1),
    filePath: z.string().min(1)
});

// Max file size to read: 2 MB
const MAX_BYTES = 2 * 1024 * 1024;

export async function GET(req: Request) {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
        localPath: url.searchParams.get("localPath"),
        filePath: url.searchParams.get("filePath")
    });

    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid query", details: parsed.error.flatten() }, { status: 400 });
    }

    const { localPath, filePath } = parsed.data;

    if (!path.isAbsolute(localPath)) {
        return NextResponse.json({ error: "localPath must be an absolute path" }, { status: 400 });
    }

    // Prevent path traversal: resolve and ensure the file is inside localPath
    const resolved = path.resolve(localPath, filePath);
    if (!resolved.startsWith(path.resolve(localPath))) {
        return NextResponse.json({ error: "Path traversal detected" }, { status: 403 });
    }

    if (!fs.existsSync(resolved)) {
        return NextResponse.json({ error: `File not found: ${filePath}` }, { status: 404 });
    }

    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
        return NextResponse.json({ error: "Path is not a file" }, { status: 400 });
    }

    if (stat.size > MAX_BYTES) {
        return NextResponse.json({ error: `File too large (max 2 MB): ${filePath}` }, { status: 413 });
    }

    try {
        const content = fs.readFileSync(resolved, "utf-8");
        return NextResponse.json({ content });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return NextResponse.json({ error: `Failed to read file: ${message}` }, { status: 500 });
    }
}
