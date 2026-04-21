import { cookies } from "next/headers";
import { z } from "zod";

const CookieSchema = z.object({
  baseURL: z.string().min(1),
  apiKey: z.string().optional(),
  model: z.string().min(1)
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

  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  const openAiModel = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  if (openAiKey) {
    return {
      baseURL: "https://api.openai.com/v1",
      apiKey: openAiKey,
      model: "gpt-4o-mini"
    };
  }

  return {
    baseURL: "http://localhost:11434/v1",
    apiKey: "ollama",
    model: "qwen2.5"
  };
}

