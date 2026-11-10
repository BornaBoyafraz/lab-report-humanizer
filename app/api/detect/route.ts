import type { NextRequest } from "next/server";
import { detect } from "@/lib/detector";

/**
 * Stateless detection endpoint. The client also runs the same engine locally
 * for instant live scoring, but this route lets other tools call the detector
 * over HTTP.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text : null;
  if (text === null) {
    return Response.json({ error: "Field 'text' (string) is required." }, { status: 400 });
  }

  return Response.json(detect(text));
}
