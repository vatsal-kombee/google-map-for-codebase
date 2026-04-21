import { NextRequest } from "next/server";
import OpenAI from "openai";
import { CopilotRuntime, OpenAIAdapter, copilotRuntimeNextJSAppRouterEndpoint } from "@copilotkit/runtime";
import { getLLMConfig } from "@/lib/llmConfig";

export const POST = async (req: NextRequest) => {
  const { baseURL, apiKey, model } = await getLLMConfig();

  const openai = new OpenAI({
    apiKey: apiKey || "ollama",
    baseURL
  });

  const serviceAdapter = new OpenAIAdapter({ openai, model });
  const runtime = new CopilotRuntime();

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit"
  });

  return handleRequest(req);
};

