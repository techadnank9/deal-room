// Probe: Moss inference gateway answering from our GTM index (retrieve: true).
import { MossInference } from "@moss-js/moss";
const m = new MossInference(process.env.MOSS_PROJECT_ID, process.env.MOSS_PROJECT_KEY);
const t0 = Date.now();
try {
  const r = await m.responses.create({ input: "Which companies are hiring QA automation engineers? Answer in one sentence.", indexes: ["gtm-engine"], retrieve: true, stream: false });
  console.log("ms", Date.now() - t0, "model", r.model);
  console.log((r.output_text ?? JSON.stringify(r.output)).slice(0, 600));
} catch (e) { console.log("ERR", e.type, e.status, e.message); }
