"use client";

import { CopilotChat } from "@copilotkit/react-core/v2";

export function ChatPanel() {
  return (
    <section className="panel h-[520px] overflow-hidden">
      <div className="panel-header">
        <span>Chat</span>
        <span className="text-xs font-normal text-white/60">tools drive UI</span>
      </div>
      <div className="h-[calc(520px-41px)]">
        <CopilotChat
          className="h-full"
          labels={{
            title: "Ask about the repo",
            initial: "Load a repo, then ask things like: “How does auth work?” or “Show me the router setup.”"
          }}
        />
      </div>
    </section>
  );
}

