import { NextRequest, NextResponse } from "next/server";
import { getLLMConfig } from "@/lib/llmConfig";

const OLLAMA_EMBED_MODEL = "nomic-embed-text";

export const POST = async (_req: NextRequest) => {
  try {
    const { baseURL, model } = await getLLMConfig();

    // Only preload if the baseURL points to a local Ollama instance
    if (baseURL.includes("127.0.0.1:11434") || baseURL.includes("localhost:11434")) {
      const ollamaHost = baseURL.replace(/\/v1\/?$/, "");

      // Quick reachability check before firing preload requests
      const pingCtrl = new AbortController();
      const pingTimer = setTimeout(() => pingCtrl.abort(), 2000);
      try {
        const ping = await fetch(`${ollamaHost}/api/tags`, { signal: pingCtrl.signal });
        clearTimeout(pingTimer);
        if (!ping.ok) {
          return NextResponse.json({ status: "unavailable", message: "Ollama returned non-OK on health check." });
        }
      } catch {
        clearTimeout(pingTimer);
        return NextResponse.json({ status: "unavailable", message: "Ollama not reachable on 127.0.0.1:11434. Start Ollama or set a cloud API key." });
      }

      // Ollama is up — fire preloads without blocking response
      fetch(`${ollamaHost}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: model, keep_alive: "1h" }),
      }).catch(() => { /* Ollama may not have model yet — silent */ });

      fetch(`${ollamaHost}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, keep_alive: "1h" }),
      }).catch(() => { /* Ollama may not have model yet — silent */ });

      return NextResponse.json({
        status: "preloading",
        message: "Ollama models are being preloaded in the background."
      });
    }

    return NextResponse.json({ 
      status: "skipped", 
      message: "Not using Ollama, skipping preload." 
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
};
