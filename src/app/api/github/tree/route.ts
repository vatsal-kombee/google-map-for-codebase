import { NextResponse } from "next/server";
import { z } from "zod";
import { parseGitHubRepoUrl } from "@/lib/repoUrl";
import { getOctokit } from "@/lib/octokit";
import { buildTree, type GitHubTreeItem } from "@/lib/tree";

const QuerySchema = z.object({
  repoUrl: z.string().min(1),
  branch: z.string().optional()
});

async function getDefaultBranch(owner: string, repo: string) {
  const octokit = getOctokit();
  const { data } = await octokit.repos.get({ owner, repo });
  return data.default_branch;
}

async function getBranchCommitSha(owner: string, repo: string, branch: string) {
  const octokit = getOctokit();
  const { data } = await octokit.repos.getBranch({ owner, repo, branch });
  return data.commit.sha;
}

const SKIP_DIRS = [
  "node_modules/",
  "vendor/",
  ".git/",
  ".next/",
  "dist/",
  "build/",
  "out/",
  ".cache/",
  "cache/",
  "storage/logs/",
  "storage/framework/cache/",
  ".cursor/",
  ".antigravity/",
  ".kiro/",
  "tmp/",
  "temp/"
];

async function getRecursiveTree(owner: string, repo: string, branch: string): Promise<GitHubTreeItem[]> {
  const octokit = getOctokit();
  // The Trees API requires a tree SHA (or commit SHA), not a branch name.
  // Resolve the branch to a commit SHA first to avoid 404s like `/git/trees/develop`.
  const commitSha = await getBranchCommitSha(owner, repo, branch);
  const { data } = await octokit.git.getTree({ owner, repo, tree_sha: commitSha, recursive: "true" });
  const tree = data.tree ?? [];
  return tree
    .filter((t) => {
      if (typeof t.path !== "string") return false;
      if (t.type !== "blob" && t.type !== "tree") return false;
      
      // Filter out ignored paths
      if (SKIP_DIRS.some(p => t.path!.includes(p) || t.path!.startsWith(p))) return false;
      
      // Filter out hidden files (except common config ones)
      const base = t.path!.split("/").pop() || "";
      if (base.startsWith(".") && base !== ".env.example" && !t.path!.startsWith(".github/")) return false;

      return true;
    })
    .map((t) => ({ path: t.path!, type: t.type as "blob" | "tree" }));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    repoUrl: url.searchParams.get("repoUrl"),
    branch: url.searchParams.get("branch") ?? undefined
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { owner, repo, branch: branchFromUrl } = parseGitHubRepoUrl(parsed.data.repoUrl);
    const branch = parsed.data.branch ?? branchFromUrl ?? (await getDefaultBranch(owner, repo));
    const items = await getRecursiveTree(owner, repo, branch);
    const tree = buildTree(items);
    return NextResponse.json({ owner, repo, branch, tree });
  } catch (e) {
    // Octokit throws an error object that may include `status`
    const status =
      typeof e === "object" && e !== null && "status" in e && typeof (e as any).status === "number" ? (e as any).status : 500;
    const message = e instanceof Error ? e.message : "Unknown error";

    if (status === 404) {
      return NextResponse.json(
        {
          error:
            "GitHub returned 404 for this repository. It may be private, deleted, or your GITHUB_TOKEN is missing/does not have access."
        },
        { status: 404 }
      );
    }

    if (status === 403) {
      return NextResponse.json(
        {
          error:
            "GitHub returned 403 (rate limited or forbidden). If this is a private repo, set GITHUB_TOKEN. If public, you may be rate-limited."
        },
        { status: 403 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

