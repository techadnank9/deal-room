import { defaultModel, MODEL_OPTIONS } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Models the UI offers. Any other model id can be typed in. */
export async function GET() {
  const anthropic = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  const openai = Boolean(process.env.OPENAI_API_KEY);
  const options = MODEL_OPTIONS.filter((m) => (m.startsWith("claude") ? anthropic : openai));
  return Response.json({ default: defaultModel(), options });
}
