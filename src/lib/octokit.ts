import { Octokit } from "@octokit/rest";

export function getOctokit() {
  const token = process.env.GITHUB_TOKEN;
  return new Octokit(token ? { auth: token } : undefined);
}

