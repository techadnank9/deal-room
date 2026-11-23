import Anthropic from "@anthropic-ai/sdk";

type Schema = Record<string, unknown>;

// Fast model for per-turn agent calls. Override with LLM_MODEL.
export const LLM_MODEL = process.env.LLM_MODEL || "claude-haiku-5-5";

// OpenAI is used when only OPENAI_API_KEY is set. Model from OPENAI_MODEL.
export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

function provider(): "anthropic" | "openai" | null {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

export function hasLLM() {
  return provider() !== null;
}

async function openaiJSON(system: string, user: string, schema: Schema, maxTokens: number): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_completion_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_schema", json_schema: { name: "out", strict: true, schema } },
    }),
    signal: AbortSignal.timeout(60000),
  });
  const json = (await res.json()) as { choices?: { message?: { content?: string; refusal?: string } }[]; error?: { message?: string } };
  if (!res.ok || json.error) throw new Error(`openai ${res.status}: ${json.error?.message ?? "error"}`);
  const msg = json.choices?.[0]?.message;
  if (!msg?.content) throw new Error(msg?.refusal ? "refusal" : "empty response");
  return msg.content;
}

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}


/**
 * Call Claude and get JSON back that matches `schema` (structured outputs).
 * Falls back to `mock()` when no key is configured or the call fails, so the
 * app keeps running during the demo.
 */
export async function llmJSON<T>(opts: {
  system: string;
  user: string;
  schema: Schema;
  mock: () => T;
  maxTokens?: number;
  label?: string;
}): Promise<{ data: T; source: "llm" | "mock" }> {
  const p = provider();
  if (!p) return { data: opts.mock(), source: "mock" };
  try {
    if (p === "openai") {
      const text = await openaiJSON(opts.system, opts.user, opts.schema, opts.maxTokens ?? 4000);
      return { data: JSON.parse(text) as T, source: "llm" };
    }
    const res = await getClient().messages.create({
      model: LLM_MODEL,
      max_tokens: opts.maxTokens ?? 4000,
      system: opts.system,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: opts.schema },
      },
      messages: [{ role: "user", content: opts.user }],
    });
    if (res.stop_reason === "refusal") throw new Error("refusal");
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return { data: JSON.parse(text) as T, source: "llm" };
  } catch (err) {
    console.error(`[llm] ${opts.label ?? "call"} failed, using mock:`, err instanceof Error ? err.message : err);
    return { data: opts.mock(), source: "mock" };
  }
}

/** Helper: strict object schema. */
export function obj(properties: Record<string, Schema>, required = Object.keys(properties)): Schema {
  return { type: "object", properties, required, additionalProperties: false };
}
export const str = (description?: string): Schema => (description ? { type: "string", description } : { type: "string" });
export const int = (description?: string): Schema => (description ? { type: "integer", description } : { type: "integer" });
export const arr = (items: Schema): Schema => ({ type: "array", items });
export const enm = (values: string[]): Schema => ({ type: "string", enum: values });
