const ITEMS: { title: string; how: string; where: string }[] = [
  {
    title: "Three or more agents, visible as 3D characters",
    how: "Start a meeting. The CFO, tech lead and procurement sit at the table and gesture, whisper and lean in as they react.",
    where: "components/room/Executive.tsx",
  },
  {
    title: "A decision log you can read",
    how: "Each turn shows every claim, its fact check, private thoughts and conviction changes as they happen.",
    where: "components/room/DecisionLog.tsx",
  },
  {
    title: "A private channel between agents on BAND",
    how: "Director hands claims to @analyst, and executives whisper to one colleague with an @mention only that colleague sees.",
    where: "lib/sponsors/band.ts",
  },
  {
    title: "A Bruin pipeline with quality checks",
    how: "After the vote, `bruin run` builds five marts in DuckDB and runs 29 checks. The score and history pages read those tables.",
    where: "bruin/deal_room/",
  },
  {
    title: "Distinct voices",
    how: "You speak by holding Space. Each executive answers in a different browser voice.",
    where: "lib/voice.ts",
  },
  {
    title: "Memory across sessions",
    how: "Meet the same account twice. The second committee remembers the claims that failed the first time.",
    where: "app/api/session/route.ts",
  },
];

export default function VerifyChecklist() {
  return (
    <ol className="grid gap-x-10 gap-y-0 md:grid-cols-2">
      {ITEMS.map((it, i) => (
        <li key={it.title} className="flex gap-4 border-t border-line py-5">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-ink text-[11px] font-semibold">
            {i + 1}
          </span>
          <div>
            <h3 className="text-[15px] font-semibold tracking-tight">{it.title}</h3>
            <p className="mt-1 text-[14px] leading-relaxed text-muted">{it.how}</p>
            <code className="mt-2 inline-block rounded-md border border-line bg-white px-1.5 py-0.5 font-mono text-[11.5px] text-ink">
              {it.where}
            </code>
          </div>
        </li>
      ))}
    </ol>
  );
}
