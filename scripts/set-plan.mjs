// Admin: set a workspace's plan directly (e.g. a design partner). Usage: node --env-file=.env.local scripts/set-plan.mjs <workspace-url> <trial|starter|growth>
import pg from "pg";
const [url, plan] = process.argv.slice(2);
if (!url || !["trial", "starter", "growth"].includes(plan)) throw new Error("usage: set-plan.mjs <workspace-url> <trial|starter|growth>");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query("update workspaces set plan = $1 where url = $2 returning id, url, plan", [plan, url]);
console.log(r.rows);
await c.end();
