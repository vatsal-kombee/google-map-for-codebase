import type { TreeNode } from "@/store/types";

export type GitHubTreeItem = {
  path: string;
  type: "blob" | "tree";
};

export function buildTree(items: GitHubTreeItem[]): TreeNode {
  const root: TreeNode = { type: "directory", name: "root", path: "", children: [] };

  for (const item of items) {
    const parts = item.path.split("/").filter(Boolean);
    let curr = root;

    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      const name = parts[i]!;
      const path = parts.slice(0, i + 1).join("/");

      if (isLast && item.type === "blob") {
        if (!curr.children.some((c) => c.type === "file" && c.path === path)) {
          curr.children.push({ type: "file", name, path });
        }
      } else {
        let next = curr.children.find((c) => c.type === "directory" && c.path === path);
        if (!next || next.type !== "directory") {
          next = { type: "directory", name, path, children: [] };
          curr.children.push(next);
        }
        curr = next;
      }
    }
  }

  sortTree(root);
  return root;
}

export function flattenTree(node: TreeNode): string[] {
  if (node.type === "file") return [node.path];
  const out: string[] = [];
  for (const c of node.children) out.push(...flattenTree(c));
  return out;
}

function sortTree(node: TreeNode) {
  if (node.type === "file") return;
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  node.children.forEach(sortTree);
}

