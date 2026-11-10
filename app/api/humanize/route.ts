import type { NextRequest } from "next/server";
import { streamText } from "ai";
import { humanizeWithRules } from "@/lib/humanize-rules";
import {
  buildSystemPrompt,
  buildUserPrompt,
  DEFAULT_MODEL,
  type Strength,
} from "@/lib/prompt";

// Node.js runtime (Fluid Compute). Streaming works here with no edge runtime.
export const maxDuration = 120;

const VALID_STRENGTHS: Strength[] = ["light", "balanced", "thorough"];

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text : "";
  const engine = body.engine === "ai" ? "ai" : "rules";
  const strength = (VALID_STRENGTHS.includes(body.strength as Strength)
    ? body.strength
    : "balanced") as Strength;
  const sample =
    typeof body.sample === "string" && body.sample.trim().length > 0
      ? (body.sample as string)
      : undefined;

  if (!text.trim()) {
    return Response.json({ error: "No text provided." }, { status: 400 });
  }

  // ---- Rule-based engine: always available, deterministic, offline. --------
  if (engine === "rules") {
    const result = humanizeWithRules(text);
    return Response.json({
      engine: "rules",
      text: result.text,
      changes: result.changes,
    });
  }

  // ---- AI engine: needs Vercel AI Gateway credentials. ---------------------
  const hasGateway =
    !!process.env.AI_GATEWAY_API_KEY ||
    !!process.env.VERCEL_OIDC_TOKEN ||
    !!process.env.VERCEL;

  if (!hasGateway) {
    return Response.json(
      {
        error:
          "The AI engine needs an AI Gateway key. Add AI_GATEWAY_API_KEY to .env.local (see README), or switch to the Rule-based engine — it works with no key.",
        code: "NO_AI_KEY",
      },
      { status: 503 }
    );
  }

  try {
    const result = streamText({
      model: DEFAULT_MODEL,
      system: buildSystemPrompt(strength),
      prompt: buildUserPrompt(text, sample),
      temperature: 0.8,
    });
    // Plain text token stream; the client reads it incrementally.
    return result.toTextStreamResponse();
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return Response.json(
      { error: `AI engine error: ${message}`, code: "AI_ERROR" },
      { status: 502 }
    );
  }
}
