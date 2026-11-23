import { randomUUID } from "node:crypto";

// Runware (https://runware.ai/docs): generated window backdrop and executive portraits.
// REST: POST https://api.runware.ai/v1, Bearer key, body is an array of tasks; image at data[].imageURL.

export function runwareEnabled() {
  return Boolean(process.env.RUNWARE_API_KEY);
}

export async function generateImage(prompt: string, width = 1024, height = 512): Promise<string | null> {
  if (!runwareEnabled()) return null;
  try {
    const res = await fetch("https://api.runware.ai/v1", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RUNWARE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        { taskType: "imageInference", taskUUID: randomUUID(), model: "runware:101@1", positivePrompt: prompt, width, height },
      ]),
      signal: AbortSignal.timeout(60000),
    });
    const json = (await res.json()) as { data?: { imageURL?: string }[]; errors?: { message?: string }[] };
    if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
    return json.data?.[0]?.imageURL ?? null;
  } catch (err) {
    console.error("[runware] failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export function backdropPrompt(company: string, city?: string) {
  return `View through floor-to-ceiling office windows of a ${city ?? "modern"} city skyline at golden hour, soft warm light, photographic, shallow depth of field, no people, no text. Headquarters of ${company}.`;
}
