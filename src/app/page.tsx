"use client";

import { CopilotKit } from "@copilotkit/react-core/v2";
import { useEffect } from "react";

import { RepoLoader } from "@/components/RepoLoader";
import { AppShell } from "@/components/AppShell";
import { useRepository } from "@/hooks/useRepository";
import { useCopilotContext } from "@/hooks/useCopilotContext";
import { useCopilotTools } from "@/hooks/useCopilotTools";
import { useRepoIndex } from "@/hooks/useRepoIndex";

function BrandIcon() {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#4fffb0]">
      <svg width="20" height="20" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="3"  r="2" fill="#0d0f14" />
        <circle cx="3" cy="14" r="2" fill="#0d0f14" />
        <circle cx="15" cy="14" r="2" fill="#0d0f14" />
        <line x1="9" y1="5"  x2="3"  y2="12" stroke="#0d0f14" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="9" y1="5"  x2="15" y2="12" stroke="#0d0f14" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="5" y1="14" x2="13" y2="14" stroke="#0d0f14" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export default function HomePage() {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit">
      <HomeInner />
    </CopilotKit>
  );
}

function HomeInner() {
  const repo = useRepository();
  useCopilotContext();
  useCopilotTools();
  useRepoIndex();

  useEffect(() => {
    fetch("/api/preload", { method: "POST" }).catch(console.error);
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0d0f14]">
      <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col overflow-hidden">

        {/* ── Header ──────────────────────────────────────────── */}
        <header className="flex shrink-0 items-center gap-5 border-b border-white/[0.08] bg-[#13151c] px-6 py-4">
          {/* Brand */}
          <div className="flex shrink-0 items-center gap-3">
            <BrandIcon />
            <div>
              <p className="text-[15px] font-bold leading-tight text-[#e8eaf0]">
                Codebase Explorer
              </p>
              <p className="mt-0.5 text-[12px] leading-none text-white/45">
                Visual dependency graph &amp; AI navigator
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="h-8 w-px shrink-0 bg-white/[0.08]" />

          {/* Repo loader */}
          <RepoLoader
            repoUrl={repo.repoUrl}
            setRepoUrl={repo.setRepoUrl}
            onExplore={repo.loadRepository}
            localPath={repo.localPath}
            setLocalPath={repo.setLocalPath}
            onExploreLocal={repo.loadLocalRepository}
            loading={repo.loading}
            sourceMode={repo.sourceMode}
            error={repo.error}
          />
        </header>

        {/* ── Content ─────────────────────────────────────────── */}
        <AppShell />

      </div>
    </div>
  );
}
