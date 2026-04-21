import { NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  baseURL: z.string().min(1),
  apiKey: z.string().optional(),
  model: z.string().min(1)
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("llm_config", JSON.stringify(parsed.data), {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
  return res;
}

