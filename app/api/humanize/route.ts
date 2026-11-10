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

  // The AI SDK's default handler logs stream errors and closes the stream
  // gracefully, so iterating textStream does NOT throw — the client would get
  // an empty 200. We capture the error via onError and check it before (and
  // during) streaming so the client always gets an actionable message.
  let captured: unknown = null;
  const result = streamText({
    model: DEFAULT_MODEL,
    system: buildSystemPrompt(strength),
    prompt: buildUserPrompt(text, sample),
    temperature: 0.8,
    onError: ({ error }) => {
      captured = error;
    },
  });

  const iterator = result.textStream[Symbol.asyncIterator]();
  let first: IteratorResult<string>;
  try {
    first = await iterator.next();
  } catch (err) {
    return Response.json(
      { error: friendlyAiError(err), code: "AI_ERROR" },
      { status: 502 }
    );
  }

  // Immediate failure (bad auth, no card/credits, model access): nothing has
  // been sent yet, so return a clean JSON error the UI can render.
  if (captured && (first.done || !first.value)) {
    return Response.json(
      { error: friendlyAiError(captured), code: "AI_ERROR" },
      { status: 502 }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done && first.value) {
          controller.enqueue(encoder.encode(first.value));
        }
        for (;;) {
          const { done, value } = await iterator.next();
          if (done) break;
          if (value) controller.enqueue(encoder.encode(value));
        }
        // Error after some tokens already streamed.
        if (captured) {
          controller.enqueue(
            encoder.encode(`\n\n[stream interrupted: ${friendlyAiError(captured)}]`)
          );
        }
        controller.close();
      } catch (err) {
        controller.enqueue(
          encoder.encode(`\n\n[stream interrupted: ${friendlyAiError(err)}]`)
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/** Turn raw gateway/model errors into something a user can act on. */
function friendlyAiError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/credit card|customer_verification|valid payment/i.test(message)) {
    return "AI Gateway needs a payment method on file to unlock your free credits. Add a card in your Vercel dashboard (AI tab), then try again. Meanwhile, the Rule-based engine works with no account at all.";
  }
  if (/insufficient|budget|quota|exceeded/i.test(message)) {
    return "AI Gateway credits/budget are exhausted for this account. Top up or raise the budget in Vercel, or use the Rule-based engine.";
  }
  if (/unauthor|forbidden|invalid.*(key|token)|oidc/i.test(message)) {
    return "AI Gateway rejected the credentials. Re-run `vercel env pull` to refresh the OIDC token (it expires ~12h), or set AI_GATEWAY_API_KEY. The Rule-based engine needs no credentials.";
  }
  return `AI engine error: ${message}`;
}
