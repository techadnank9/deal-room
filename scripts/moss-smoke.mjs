// Moss check: lists indexes; with --delete <name> removes one of ours.
import { MossClient } from "@moss-js/moss";
const c = new MossClient(process.env.MOSS_PROJECT_ID, process.env.MOSS_PROJECT_KEY);
try {
  const i = process.argv.indexOf("--delete");
  if (i > 0) console.log("deleted", process.argv[i + 1], await c.deleteIndex(process.argv[i + 1]));
  console.log((await c.listIndexes()).map((x) => `${x.name} docs=${x.docCount ?? "?"}`));
  const r = await c.createIndex("gtm-probe", [{ id: "a", text: "probe" }]).catch((e) => ({ error: e.message }));
  console.log("probe create", JSON.stringify(r));
  if (!r.error) await c.deleteIndex("gtm-probe");
} finally { await c.close(); }
