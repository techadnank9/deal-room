import Anthropic from "@anthropic-ai/sdk";
import { AsyncLocalStorage } from "node:async_hooks";

type Schema = Record<string, unknown>;

// The model is chosen per session (setup page or the room's model switcher) and can change any time.
// Provider follows the model name: "claude-*" uses Anthropic, anything else uses OpenAI.
export const MODEL_OPTIONS = [
  "gpt-6.2-sol",
  "gpt-4.1-mini",
  "gpt-4.1",
  "gpt-5.4-mini",
  "gpt-5.5",
  "claude-haiku-5-5",
  "claude-sonnet-5-5",
  "claude-opus-5-5",
];

const modelScope = new AsyncLocalStorage<string>();
/** Run fn with a request-scoped model; every llmJSON call inside uses it. */
export function withModel<T>(model: string | undefined, fn: () => Promise<T>): Promise<T> {
  return model ? modelScope.run(model, fn) : fn();
}

export function defaultModel() {
  if (process.env.LLM_MODEL) return process.env.LLM_MODEL;
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return "claude-haiku-5-5";
  return "gpt-6.2-sol"; // best default; LLM_MODEL or the per-session picker overrides it
}

export function currentModel() {
  return modelScope.getStore() || defaultModel();
}

function provider(model: string): "anthropic" | "openai" | null {
  const anthropic = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  const openai = Boolean(process.env.OPENAI_API_KEY);
  if (model.startsWith("claude")) return anthropic ? "anthropic" : null;
  return openai ? "openai" : null;
}

export function hasLLM() {
  return provider(currentModel()) !== null;
}

async function openaiJSON(model: string, system: string, user: string, schema: Schema, maxTokens: number): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
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
  const model = currentModel();
  const p = provider(model);
  if (!p) return { data: opts.mock(), source: "mock" };
  try {
    if (p === "openai") {
      const text = await openaiJSON(model, opts.system, opts.user, opts.schema, opts.maxTokens ?? 4000);
      return { data: JSON.parse(text) as T, source: "llm" };
    }
    const res = await getClient().messages.create({
      model,
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
