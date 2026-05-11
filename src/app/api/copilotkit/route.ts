import { NextRequest } from "next/server";
import OpenAI from "openai";
import { Groq } from "groq-sdk";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { stepCountIs, streamText, wrapLanguageModel, type LanguageModelMiddleware } from "ai";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
import {
  BuiltInAgent,
  convertMessagesToVercelAISDKMessages,
  convertToolDefinitionsToVercelAITools,
  convertToolsToVercelAITools
} from "../../../../node_modules/@copilotkit/runtime/dist/agent/index.mjs";
import {
  CopilotRuntime,
  OpenAIAdapter,
  GroqAdapter,
  GoogleGenerativeAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint
} from "@copilotkit/runtime";
import { getLLMConfig } from "@/lib/llmConfig";

const DEFAULT_LLM_TIMEOUT_MS = 30 * 60 * 1000;

function getTimeoutMs() {
  const configured = Number(process.env.LLM_REQUEST_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_LLM_TIMEOUT_MS;
}

function createOpenAICompatibleFetch(timeoutMs: number): typeof fetch {
  return async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const request = url.protocol === "https:" ? httpsRequest : httpRequest;
    const signal = init.signal ?? undefined;
    const headers = new Headers(init.headers);

    return await new Promise<Response>((resolve, reject) => {
      const req = request(
        url,
        {
          method: init.method ?? "GET",
          headers: Object.fromEntries(headers.entries())
        },
        (res) => {
          const body =
            res.statusCode === 204 || res.statusCode === 304 ? null : (Readable.toWeb(res) as ReadableStream);
          resolve(
            new Response(body, {
              status: res.statusCode ?? 500,
              statusText: res.statusMessage ?? "",
              headers: res.headers as HeadersInit
            })
          );
        }
      );

      req.setTimeout(timeoutMs, () => {
        req.destroy(new DOMException(`Request idle for ${timeoutMs}ms`, "AbortError"));
      });

      const abort = () => {
        req.destroy(new DOMException("Request aborted", "AbortError"));
      };

      signal?.addEventListener("abort", abort, { once: true });

      req.on("error", (error) => {
        signal?.removeEventListener("abort", abort);
        reject(error);
      });

      req.on("close", () => {
        signal?.removeEventListener("abort", abort);
      });

      const body = init.body;
      if (typeof body === "string") {
        req.write(body);
      } else if (body instanceof Uint8Array) {
        req.write(body);
      }

      req.end();
    });
  };
}

// Fixes two Ollama/local-model bugs:
// 1. Tool name contains embedded JSON args: `semanticSearch{"query":"..."}` and must be split.
// 2. Tool args are sometimes "null" instead of "{}" for no-param tools like getProjectInfo.
const sanitizeToolNamesMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  wrapStream: async ({ doStream }) => {
    const { stream, ...rest } = await doStream();

    const pending = new Map<string, { deltas: LanguageModelV3StreamPart[]; accumulated: string }>();

    const transformed = stream.pipeThrough(
      new TransformStream<LanguageModelV3StreamPart, LanguageModelV3StreamPart>({
        transform(chunk, controller) {
          if (chunk.type === "tool-input-start") {
            const braceIdx = chunk.toolName.indexOf("{");
            if (braceIdx !== -1) {
              const cleanName = chunk.toolName.slice(0, braceIdx);
              const embeddedJson = chunk.toolName.slice(braceIdx);
              pending.set(chunk.id, { deltas: [], accumulated: embeddedJson });
              controller.enqueue({ ...chunk, toolName: cleanName });
              pending.get(chunk.id)!.deltas.push({ type: "tool-input-delta", id: chunk.id, delta: embeddedJson });
            } else {
              pending.set(chunk.id, { deltas: [], accumulated: "" });
              controller.enqueue(chunk);
            }
            return;
          }

          if (chunk.type === "tool-input-delta") {
            const state = pending.get(chunk.id);
            if (state) {
              state.deltas.push(chunk);
              state.accumulated += chunk.delta;
              return;
            }
            controller.enqueue(chunk);
            return;
          }

          if (chunk.type === "tool-input-end") {
            const state = pending.get(chunk.id);
            if (state) {
              const args = state.accumulated.trim();
              if (args === "null" || args === "") {
                controller.enqueue({ type: "tool-input-delta", id: chunk.id, delta: "{}" });
              } else {
                for (const delta of state.deltas) controller.enqueue(delta);
              }
              pending.delete(chunk.id);
            }
            controller.enqueue(chunk);
            return;
          }

          controller.enqueue(chunk);
        }
      })
    );

    return { stream: transformed, ...rest };
  }
};

function buildSystemPrompt(
  prompt?: string,
  context?: Array<{ description?: string; value?: string }>,
  state?: unknown
) {
  const parts: string[] = [];
  const hasContext = Boolean(context && context.length > 0);
  const hasState =
    state !== undefined &&
    state !== null &&
    !(typeof state === "object" && Object.keys(state as Record<string, unknown>).length === 0);

  if (prompt) {
    parts.push(prompt);
  }

  if (hasContext && context) {
    parts.push("\n## Context from the application\n");
    for (const item of context) {
      parts.push(`${item.description}:\n${item.value}\n`);
    }
  }

  if (hasState) {
    parts.push(`
## Application State
This is state from the application that you can edit by calling AGUISendStateSnapshot or AGUISendStateDelta.
\`\`\`json
${JSON.stringify(state, null, 2)}
\`\`\`
`);
  }

  return parts.length > 0 ? parts.join("") : undefined;
}

export const maxDuration = 600;

export const POST = async (req: NextRequest) => {
  const config = await getLLMConfig();
  const timeoutMs = getTimeoutMs();

  const isGoogle = config.provider === "google";
  const isGroq = config.provider === "groq";
  const isOfficialOpenAI = config.provider === "openai";
  const openAICompatibleFetch = isGoogle ? undefined : createOpenAICompatibleFetch(timeoutMs);

  let serviceAdapter: any;

  if (isGoogle) {
    serviceAdapter = new GoogleGenerativeAIAdapter({
      apiKey: config.apiKey,
      model: config.model
    });
  } else if (isGroq) {
    const groq = new Groq({ apiKey: config.apiKey });
    serviceAdapter = new GroqAdapter({
      groq,
      model: config.model,
      disableParallelToolCalls: true
    });
  } else {
    const openai = new OpenAI({
      apiKey: config.apiKey || "ollama",
      baseURL: config.baseURL,
      timeout: timeoutMs,
      fetch: openAICompatibleFetch
    });
    serviceAdapter = new OpenAIAdapter({
      openai,
      model: config.model,
      disableParallelToolCalls: true
    });
  }

  const model = isGoogle
    ? createGoogleGenerativeAI({ apiKey: config.apiKey })(config.model)
    : isGroq || !isOfficialOpenAI
      ? createOpenAI({
          apiKey: config.apiKey || "ollama",
          baseURL: config.baseURL,
          name: isGroq ? "groq" : "openai-compatible",
          fetch: openAICompatibleFetch
        }).chat(config.model)
      : createOpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseURL,
          fetch: openAICompatibleFetch
        }).chat(config.model);

  const wrappedModel = wrapLanguageModel({ model, middleware: sanitizeToolNamesMiddleware });

  const runtime = new CopilotRuntime({
    agents: {
      default: new BuiltInAgent({
        type: "aisdk",
        factory: ({ input, abortSignal }) => {
          const system = buildSystemPrompt("prompt" in input ? (input.prompt as string | undefined) : undefined, input.context, input.state);
          let messages = convertMessagesToVercelAISDKMessages(input.messages, {
            forwardSystemMessages: false,
            forwardDeveloperMessages: false
          });

          // Trim message history to stay under NVIDIA token limits (last 12 messages)
          if (messages.length > 12 && process.env.NVIDIA_API_KEY) {
            messages = messages.slice(-12);
          }

          let allTools = convertToolsToVercelAITools(input.tools);
          const configTools = convertToolDefinitionsToVercelAITools([]);
          allTools = {
            ...allTools,
            ...configTools
          };

          return streamText({
            model: wrappedModel,
            system,
            messages,
            allowSystemInMessages: true,
            tools: allTools,
            toolChoice: "auto",
            stopWhen: stepCountIs(5),
            temperature: 0,
            maxRetries: process.env.NVIDIA_API_KEY ? 5 : 2,
            abortSignal,
            providerOptions: {
              openai: {
                parallelToolCalls: false,
                strictJsonSchema: false
              },
              groq: {
                parallelToolCalls: false,
                strictJsonSchema: false
              },
              "openai-compatible": {
                parallelToolCalls: false,
                strictJsonSchema: false
              }
            }
          });
        }
      })
    }
  });

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit"
  });

  try {
    const clonedReq = req.clone();
    const body = await clonedReq.json().catch(() => ({}));
    console.log("CopilotKit Request Body:", JSON.stringify(body, null, 2));

    return await handleRequest(req);
  } catch (error: any) {
    console.error("CopilotKit Runtime Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
