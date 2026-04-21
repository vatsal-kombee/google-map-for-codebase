export function parseGitHubRepoUrl(repoUrl: string): { owner: string; repo: string; branch?: string } {
  const url = new URL(repoUrl.trim());
  if (url.hostname !== "github.com") {
    throw new Error("Only github.com URLs are supported right now.");
  }
  const parts = url.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error("Invalid GitHub repo URL. Expected https://github.com/<owner>/<repo>");
  }
  const owner = parts[0]!;
  const repo = parts[1]!.replace(/\.git$/i, "");

  // Support URLs like:
  // - https://github.com/<owner>/<repo>/tree/<branch>
  // - https://github.com/<owner>/<repo>/blob/<branch>/<path>
  let branch: string | undefined;
  const marker = parts[2];
  if ((marker === "tree" || marker === "blob") && typeof parts[3] === "string" && parts[3].length > 0) {
    branch = decodeURIComponent(parts[3]);
  }

  return { owner, repo, branch };
}

