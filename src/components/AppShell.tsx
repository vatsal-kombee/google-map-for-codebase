"use client";

import { RepoExplorerPanel } from "@/components/panels/RepoExplorerPanel";
import { GraphPanel } from "@/components/panels/GraphPanel";
import { CodeViewerPanel } from "@/components/panels/CodeViewerPanel";
import { ChatPanel } from "@/components/panels/ChatPanel";

export function AppShell() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="lg:col-span-3">
        <RepoExplorerPanel />
      </div>
      <div className="lg:col-span-6">
        <GraphPanel />
      </div>
      <div className="lg:col-span-3">
        <CodeViewerPanel />
      </div>
      <div className="lg:col-span-12">
        <ChatPanel />
      </div>
    </div>
  );
}

