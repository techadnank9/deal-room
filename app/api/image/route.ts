export const runtime = "nodejs";

// Same-origin proxy for generated images so WebGL textures load without CORS issues.
const ALLOWED = ["im.runware.ai"];

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("url") || "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (target.protocol !== "https:" || !ALLOWED.includes(target.hostname)) return new Response("host not allowed", { status: 403 });
  const res = await fetch(target, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return new Response("upstream error", { status: 502 });
  return new Response(res.body, {
    headers: { "content-type": res.headers.get("content-type") || "image/jpeg", "cache-control": "public, max-age=86400" },
  });
}
