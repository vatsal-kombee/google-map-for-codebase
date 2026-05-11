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
    // Octokit wraps HTTP errors as objects with a numeric `status` field.
    const status = (e != null && typeof e === "object" && "status" in e)
      ? (e as { status: unknown }).status
      : undefined;

    if (status === 429) {
      const retryAfter =
        (e != null && typeof e === "object" && "response" in e)
          ? ((e as { response?: { headers?: Record<string, string> } }).response?.headers?.["retry-after"] ?? "60")
          : "60";
      return NextResponse.json(
        { error: "GitHub API rate limit exceeded — try again shortly." },
        { status: 429, headers: { "Retry-After": retryAfter } }
      );
    }

    if (status === 403) {
      return NextResponse.json({ error: "GitHub API forbidden — check your GITHUB_TOKEN." }, { status: 403 });
    }

    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: typeof status === "number" ? status : 500 });
  }
}

