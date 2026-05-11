import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// Forced to use Ollama's nomic-embed-text for local, free embeddings.
const OLLAMA_EMBED_MODEL = "nomic-embed-text";

export const POST = async (req: NextRequest) => {
  try {
    const { texts }: { texts: string[] } = await req.json();
    if (!texts?.length) return NextResponse.json({ embeddings: [] });

    let baseURL = "http://127.0.0.1:11434/v1";
    let apiKey = "ollama";
    let model = OLLAMA_EMBED_MODEL;

    if (process.env.NVIDIA_API_KEY) {
      baseURL = "https://integrate.api.nvidia.com/v1";
      apiKey = process.env.NVIDIA_API_KEY;
      model = process.env.NVIDIA_EMBED_MODEL || "nvidia/nv-embedqa-e5-v5";
    } else if (process.env.OPENAI_API_KEY) {
      baseURL = "https://api.openai.com/v1";
      apiKey = process.env.OPENAI_API_KEY;
      model = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";
    }

    const openai = new OpenAI({ apiKey, baseURL, timeout: 60_000 });

    const batchSize = 5; 
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      // NVIDIA NIM requires 'input_type' for models like E5
      // If we have multiple texts, it's a 'passage' indexing batch.
      const extraParams = process.env.NVIDIA_API_KEY 
        ? { input_type: batch.length > 1 ? "passage" : "query" } 
        : {};

      let retryCount = 0;
      const maxRetries = 5;
      let success = false;

      while (!success && retryCount < maxRetries) {
        try {
          const response = await openai.embeddings.create({
            model,
            input: batch.map((t) => t.slice(0, 8000)),
            ...extraParams
          } as any);

          const batchEmbeddings = response.data
            .sort((a, b) => a.index - b.index)
            .map((d) => d.embedding);
          
          allEmbeddings.push(...batchEmbeddings);
          success = true;

          // Mandatory delay between batches to avoid 429s
          if (process.env.NVIDIA_API_KEY) {
            await new Promise(resolve => setTimeout(resolve, 600));
          }
        } catch (e: any) {
          if (e?.status === 429 && retryCount < maxRetries - 1) {
            const delay = Math.pow(2, retryCount) * 2000;
            console.log(`Rate limited (429). Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            retryCount++;
          } else {
            throw e;
          }
        }
      }
    }

    return NextResponse.json({ embeddings: allEmbeddings });
  } catch (e: any) {
    console.error("Embedding API Error:", e);
    
    let msg = e instanceof Error ? e.message : "Embedding failed";
    
    // Add helpful tips
    if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
      msg = `Model not found. If using Ollama, run: ollama pull ${OLLAMA_EMBED_MODEL}. If using NVIDIA/OpenAI, check your model name.`;
    } else if (msg.includes("ECONNREFUSED")) {
      msg = "Could not connect to the API. If using local Ollama, ensure it is running on 127.0.0.1:11434";
    } else if (msg.includes("401") || msg.toLowerCase().includes("unauthorized")) {
      msg = "API Key is invalid or missing.";
    }

    return NextResponse.json({ error: msg, details: e.toString() }, { status: 500 });
  }
};
