"use client";

import { CopilotKit } from "@copilotkit/react-core/v2";

import { RepoLoader } from "@/components/RepoLoader";
import { AppShell } from "@/components/AppShell";
import { useRepository } from "@/hooks/useRepository";
import { useCopilotContext } from "@/hooks/useCopilotContext";
import { useCopilotTools } from "@/hooks/useCopilotTools";

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

  return (
    <div className="min-h-screen p-4">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <header className="panel">
          <div className="panel-body flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-lg font-semibold">Google Maps for Codebases</div>
              <div className="text-sm text-white/70">
                Paste a GitHub URL, ask questions, and see a real import-based graph.
              </div>
            </div>
            <RepoLoader
              repoUrl={repo.repoUrl}
              setRepoUrl={repo.setRepoUrl}
              onExplore={repo.loadRepository}
              loading={repo.loading}
            />
          </div>
        </header>

        <AppShell />
      </div>
    </div>
  );
}

