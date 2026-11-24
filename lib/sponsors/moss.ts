// Moss (https://moss.dev): sub-10 ms semantic search that runs inside our server process.
// Every lead, source, signal, contact and email the agents produce is indexed per company. Agents query it
// before they act (dedupe, "which lead matches this signal", lookalikes of reference customers), and the
// GTM page has a search box over everything. No MOSS keys: a local keyword index stands in.
import { MossClient } from "@moss-js/moss";

export type MossDoc = { id: string; text: string; metadata?: Record<string, string> };
export type MossHit = { id: string; text: string; score: number; metadata?: Record<string, string>; };

type State = { client?: MossClient; ready: Map<string, Promise<void>>; local: Map<string, Map<string, MossDoc>>; dirty: Set<string> };
const g = globalThis as unknown as { __moss?: State };
const st: State = (g.__moss ??= { ready: new Map(), local: new Map(), dirty: new Set() });

export function mossEnabled() {
  return Boolean(process.env.MOSS_PROJECT_ID && process.env.MOSS_PROJECT_KEY);
}
function client() {
  return (st.client ??= new MossClient(process.env.MOSS_PROJECT_ID!, process.env.MOSS_PROJECT_KEY!, { keepModels: true }));
}
// One shared index (free projects cap the number of indexes); each doc carries its company's domain.
export const INDEX = process.env.MOSS_INDEX || "gtm-engine";
export function indexName(domain: string) {
  return `${INDEX}:${domain.toLowerCase()}`;
}

function local(index: string) {
  let m = st.local.get(index);
  if (!m) st.local.set(index, (m = new Map()));
  return m;
}

/** Add or update documents. Keeps a local mirror so search works even before the cloud job finishes. */
export async function indexDocs(domain: string, docs: MossDoc[]) {
  if (!docs.length) return;
  const index = indexName(domain);
  const mirror = local(index);
  const d0 = domain.toLowerCase();
  const clean = docs.map((d) => ({ id: d.id, text: d.text.slice(0, 2000), metadata: { ...d.metadata, domain: d0 } }));
  for (const d of clean) mirror.set(d.id, d);
  if (!mossEnabled()) return;
  try {
    const c = client();
    const cloud = clean.map((d) => ({ ...d, id: `${d0}|${d.id}` }));
    const names = (await c.listIndexes()).map((i) => i.name);
    if (!names.includes(INDEX)) await c.createIndex(INDEX, cloud);
    else await c.addDocs(INDEX, cloud, { upsert: true });
    st.dirty.add(INDEX);
  } catch (err) {
    console.error("[moss] index failed:", err instanceof Error ? err.message : err);
  }
}

async function ensureLoaded(index: string) {
  const c = client();
  if (st.dirty.has(index) || !st.ready.has(index)) {
    st.dirty.delete(index);
    const p = c.loadIndex(index).then(() => undefined);
    st.ready.set(index, p);
  }
  await st.ready.get(index);
}

function keywordSearch(index: string, q: string, topK: number, kind?: string): MossHit[] {
  const words = q.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  return [...local(index).values()]
    .filter((d) => !kind || d.metadata?.kind === kind)
    .map((d) => {
      const t = d.text.toLowerCase();
      const score = words.reduce((s, w) => s + (t.includes(w) ? 1 : 0), 0) / Math.max(1, words.length);
      return { id: d.id, text: d.text, score, metadata: d.metadata };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/** Semantic search over a company's GTM memory. Returns hits plus how long retrieval took. */
export async function search(domain: string, q: string, opts: { topK?: number; kind?: string } = {}): Promise<{ hits: MossHit[]; ms: number; provider: "moss" | "local" }> {
  const index = indexName(domain);
  const topK = opts.topK ?? 6;
  const t0 = performance.now();
  if (mossEnabled()) {
    try {
      await ensureLoaded(INDEX);
      const t1 = performance.now();
      const r = await client().query(INDEX, q, { topK: topK * 10 });
      const ms = performance.now() - t1;
      const d0 = domain.toLowerCase();
      let hits: MossHit[] = r.docs
        .filter((d) => (d.metadata as Record<string, string> | undefined)?.domain === d0)
        .map((d) => ({ id: d.id.slice(d0.length + 1), text: d.text, score: d.score, metadata: d.metadata as Record<string, string> | undefined }));
      if (opts.kind) hits = hits.filter((h) => h.metadata?.kind === opts.kind);
      // Docs added after the last load are not in the loaded copy yet: merge from the mirror.
      const seen = new Set(hits.map((h) => h.id));
      const extra = keywordSearch(index, q, topK, opts.kind).filter((h) => !seen.has(h.id)).map((h) => ({ ...h, score: h.score * 0.5 }));
      return { hits: [...hits, ...extra].slice(0, topK), ms: Math.round(ms * 10) / 10, provider: "moss" };
    } catch (err) {
      console.error("[moss] search failed, using local:", err instanceof Error ? err.message : err);
    }
  }
  const hits = keywordSearch(index, q, topK, opts.kind);
  return { hits, ms: Math.round((performance.now() - t0) * 10) / 10, provider: "local" };
}
