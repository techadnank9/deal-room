export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ElevenLabs text-to-speech: one distinct voice per executive. Key stays server-side.
const VOICES: Record<string, string> = {
  cfo: "Xb7hH8MSUJpSbSDYk0k2", // Alice: clear, professional
  tech: "cjVigY5qzO86Huf0OWal", // Eric: smooth, trustworthy
  procurement: "XrExE9yKIg1WjnnlVkGX", // Matilda: knowledgeable, professional
  analyst: "onwK4e9ZLuTAKqWW03F9", // Daniel: steady broadcaster
};

export async function POST(req: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return new Response("tts not configured", { status: 503 });
  const { text, agent } = (await req.json()) as { text?: string; agent?: string };
  const clean = (text || "").slice(0, 600);
  if (!clean) return new Response("empty", { status: 400 });
  const voice = VOICES[agent ?? ""] ?? VOICES.analyst;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: clean, model_id: "eleven_flash_v2_5", voice_settings: { stability: 0.45, similarity_boost: 0.8 } }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok || !res.body) {
    console.error("[tts] elevenlabs", res.status, (await res.text()).slice(0, 200));
    return new Response("tts failed", { status: 502 });
  }
  return new Response(res.body, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
}
