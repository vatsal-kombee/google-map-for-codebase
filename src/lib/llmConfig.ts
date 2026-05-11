import { cookies } from "next/headers";
import { z } from "zod";

const CookieSchema = z.object({
  baseURL: z.string().min(1),
  apiKey: z.string().optional(),
  model: z.string().min(1),
  provider: z.enum(["openai", "groq", "google", "ollama", "nvidia"]).optional()
});

export type LLMConfig = z.infer<typeof CookieSchema>;

export async function getLLMConfig(): Promise<LLMConfig> {
  const raw = (await cookies()).get("llm_config")?.value;
  if (raw) {
    try {
      const parsed = CookieSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    } catch {
      // ignore invalid cookie
    }
  }

  const nvidiaKey = process.env.NVIDIA_API_KEY?.trim();
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  const openAiModel = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  if (nvidiaKey) {
    const nvidiaModel = process.env.NVIDIA_MODEL?.trim() || "meta/llama-3.3-70b-instruct";
    return {
      baseURL: "https://integrate.api.nvidia.com/v1",
      apiKey: nvidiaKey,
      model: nvidiaModel,
      provider: "nvidia"
    };
  }

  if (googleKey) {
    const googleModel = process.env.GOOGLE_MODEL?.trim() || "gemini-2.0-flash";
    return {
      baseURL: "https://generativelanguage.googleapis.com",
      apiKey: googleKey,
      model: googleModel,
      provider: "google"
    };
  }

  if (groqKey) {
    const groqModel = process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
    return {
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: groqKey,
      model: groqModel,
      provider: "groq"
    };
  }

  if (openAiKey) {
    return {
      baseURL: "https://api.openai.com/v1",
      apiKey: openAiKey,
      model: openAiModel,
      provider: "openai"
    };
  }

  return {
    baseURL: "http://127.0.0.1:11434/v1",
    apiKey: "ollama",
    model: "qwen2.5",
    provider: "ollama"
  };
}

