"use client";

import { useAgentContext } from "@copilotkit/react-core/v2";
import { useMemo } from "react";
import { useAppStore } from "@/store/appStore";

export function useCopilotContext() {
  const repoInfo = useAppStore((s) => s.repo.repoInfo);
  const filePaths = useAppStore((s) => s.repo.filePaths);
  const selectedFile = useAppStore((s) => s.repo.selectedFile);

  // Keep context compact for local Ollama models to reduce latency/timeouts.
  const fileList = useMemo(() => filePaths.slice(0, 80).join("\n"), [filePaths]);
  const repoLabel = repoInfo ? `${repoInfo.owner}/${repoInfo.repo}@${repoInfo.branch}` : "none";

  useAgentContext({
    description: "Repository identifier (owner/repo@branch)",
    value: repoLabel
  });

  useAgentContext({
    description: "File paths in the repository (max 80), one per line",
    value: fileList || "(no repo loaded)"
  });

  useAgentContext({
    description: "Current selected file path (or null)",
    value: selectedFile ?? "null"
  });

  useAgentContext({
    description: "System instructions",
    value: [
      "You are a Codebase Navigator assistant.",
      "TOOL SELECTION RULES:",
      '1. If the user asks to open/show/read a specific file, call "fetchFileContent" directly (do NOT call "analyzeRepository" first).',
      '2. If the user asks about specific lines or code location in a known file, call "highlightCode".',
      '3. Call "analyzeRepository" only for broad repository questions (architecture, flow, "how does X work?", "where is X implemented?" across multiple files).',
      '4. Keep analysis lightweight: avoid repeated broad analysis for follow-ups that can be answered from already opened files.',
      "5. Only use file paths that exist in the provided file list.",
      "6. Prioritize the currently selected file for follow-up questions when possible.",
      "7. If no repository is loaded, ask the user to paste a GitHub URL first."
    ].join("\n")
  });
}

