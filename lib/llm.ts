import Anthropic from "@anthropic-ai/sdk";

// Fast model for per-turn agent calls. Override with LLM_MODEL.
export const LLM_MODEL = process.env.LLM_MODEL || "claude-haiku-5-5";

export function hasLLM() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

type Schema = Record<string, unknown>;

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
  if (!hasLLM()) return { data: opts.mock(), source: "mock" };
  try {
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
