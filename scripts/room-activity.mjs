import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows } = await c.query("select k, v from kv where k like 'team-state:%'");
const now = Date.now();
const out = rows.map(({ k, v }) => {
  const s = JSON.parse(v);
  const times = [...(s.activity ?? []).map((a) => a.at), ...(s.chat ?? []).map((x) => x.at), ...(s.leads ?? []).map((l) => l.at)].filter(Boolean).sort();
  const last = times.at(-1);
  const recent = times.filter((t) => now - Date.parse(t) < 3600e3).length;
  return { k: k.replace("team-state:", ""), leads: s.leads?.length ?? 0, last, minsAgo: last ? Math.round((now - Date.parse(last)) / 60000) : null, eventsLastHour: recent };
}).sort((a, b) => (a.minsAgo ?? 1e9) - (b.minsAgo ?? 1e9));
console.table(out.slice(0, 15));
await c.end();
