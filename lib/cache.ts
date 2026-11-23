import fs from "node:fs";
import path from "node:path";

// Offline fallback for the demo: real research/enrichment results are cached per domain in demo-cache/
// (committed), and reused when the network or a sponsor key is unavailable during the demo.

const DIR = path.join(process.cwd(), "demo-cache");

export function readCache<T>(kind: string, domain: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, `${domain}.${kind}.json`), "utf8")) as T;
  } catch {
    return null;
  }
}

export function writeCache(kind: string, domain: string, data: unknown) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(path.join(DIR, `${domain}.${kind}.json`), JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("[cache] write failed:", err instanceof Error ? err.message : err);
  }
}
