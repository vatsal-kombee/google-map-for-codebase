import { NextResponse } from "next/server";
import { z } from "zod";
import { getOctokit } from "@/lib/octokit";

const QuerySchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  path: z.string().min(1),
  ref: z.string().min(1)
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    owner: url.searchParams.get("owner"),
    repo: url.searchParams.get("repo"),
    path: url.searchParams.get("path"),
    ref: url.searchParams.get("ref")
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.flatten() }, { status: 400 });
  }

  const { owner, repo, path, ref } = parsed.data;
  try {
    const octokit = getOctokit();
    const { data } = await octokit.repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(data) || data.type !== "file") {
      return NextResponse.json({ error: "Not a file path" }, { status: 400 });
    }
    const contentBase64 = data.content ?? "";
    const decoded = Buffer.from(contentBase64, "base64").toString("utf-8");
    return NextResponse.json({ content: decoded });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

