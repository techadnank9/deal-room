"use client";
// Campaign: edit the sequence (steps, delays, how each step is written) and the template library, with a preview on a real lead.
import { useState } from "react";
import { Btn, post } from "./ui";
import type { TeamState } from "@/lib/agents/team";
import type { StepPlan, Template } from "@/lib/gtm/types";

const uid = () => Math.random().toString(36).slice(2, 9);
const box = "rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm outline-none focus:border-ink";
const input = `w-full ${box}`;
const VARS = "{first_name} {company} {signal} {sender} {sender_company}";

export function defaultSteps(followUpDays: number, linkedin: boolean): StepPlan[] {
  return [
    { id: uid(), channel: "email", dayOffset: 0, mode: "ai" },
    ...(linkedin ? [{ id: uid(), channel: "linkedin" as const, dayOffset: 1, mode: "ai" as const }] : []),
    { id: uid(), channel: "email", dayOffset: followUpDays, mode: "ai" },
    { id: uid(), channel: "email", dayOffset: followUpDays * 2 + 1, mode: "ai" },
  ];
}

export default function SequenceEditor({ t, reload }: { t: TeamState; reload: () => Promise<void> }) {
  const cmp = t.campaign;
  const custom = Boolean(cmp?.steps?.length);
  const [steps, setSteps] = useState<StepPlan[]>(cmp?.steps?.length ? cmp.steps : defaultSteps(cmp?.followUpDays ?? 4, cmp?.linkedinStep ?? true));
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const templates = t.templates ?? [];

  const set = (i: number, p: Partial<StepPlan>) => {
    setSteps(steps.map((s, j) => (j === i ? { ...s, ...p } : s)));
    setDirty(true);
  };
  const move = (i: number, d: -1 | 1) => {
    const n = [...steps];
    const j = i + d;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    // Keep delays in order: a step moved up takes the earlier day.
    const days = steps.map((s) => s.dayOffset).sort((a, b) => a - b);
    setSteps(n.map((s, k) => ({ ...s, dayOffset: days[k] })));
    setDirty(true);
  };

  async function save(reset = false) {
    const first = steps[0];
    if (!reset && (!first || first.channel !== "email" || first.dayOffset !== 0)) return setMsg("The first step must be an email on day 0.");
    setBusy("save");
    setMsg(null);
    try {
      await post("/api/gtm", { action: "agentSettings", campaign: { ...(cmp ?? {}), steps: reset ? [] : steps } });
      await reload();
      if (reset) setSteps(defaultSteps(cmp?.followUpDays ?? 4, cmp?.linkedinStep ?? true));
      setDirty(false);
      setMsg(reset ? "Back to the default sequence." : "Saved. New drafts use this sequence.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(null);
    }
  }
  async function redraft() {
    setBusy("redraft");
    setMsg(null);
    try {
      const r = await post<{ redrafted: number }>("/api/gtm", { action: "redraft" });
      await reload();
      setMsg(`Rewrote ${r.redrafted} waiting draft${r.redrafted === 1 ? "" : "s"} with this sequence.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not rewrite");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Sequence</h2>
            <p className="text-sm text-muted">{custom ? "Your custom sequence." : "The default sequence. Change anything and save to make it yours."} Follow-ups stop the moment someone replies.</p>
          </div>
          {custom && (
            <button className="text-sm text-muted underline" disabled={busy !== null} onClick={() => void save(true)}>
              Reset to default
            </button>
          )}
        </div>
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={s.id} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-paper text-xs font-semibold">{i + 1}</span>
                <select aria-label="Channel" className={box} value={s.channel} onChange={(e) => set(i, { channel: e.target.value as StepPlan["channel"] })}>
                  <option value="email">Email</option>
                  <option value="linkedin">LinkedIn note (you send it)</option>
                </select>
                <label className="flex items-center gap-1.5">
                  on day
                  <input aria-label="Day" type="number" min={0} max={60} className={`${box} w-16`} value={s.dayOffset} onChange={(e) => set(i, { dayOffset: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })} />
                </label>
                <select aria-label="How it is written" className={box} value={s.mode} onChange={(e) => set(i, { mode: e.target.value as StepPlan["mode"] })}>
                  <option value="ai">AI writes it from the lead&apos;s signal</option>
                  <option value="template">AI follows a template</option>
                  <option value="fixed">Same text for everyone</option>
                </select>
                <span className="ml-auto flex gap-1">
                  <button className="rounded-md border border-line px-2 py-1 text-xs" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                    ↑
                  </button>
                  <button className="rounded-md border border-line px-2 py-1 text-xs" disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                    ↓
                  </button>
                  <button
                    className="rounded-md border border-line px-2 py-1 text-xs hover:border-rose-400"
                    disabled={steps.length <= 1}
                    onClick={() => {
                      setSteps(steps.filter((_, j) => j !== i));
                      setDirty(true);
                    }}
                    aria-label="Remove step"
                  >
                    ✕
                  </button>
                </span>
              </div>
              <div className="mt-2">
                {s.mode === "template" && (
                  <select aria-label="Template" className={input} value={s.templateId ?? ""} onChange={(e) => set(i, { templateId: e.target.value })}>
                    <option value="">Pick a template…</option>
                    {templates.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                )}
                {s.mode === "fixed" && (
                  <>
                    {i === 0 && s.channel === "email" && <input aria-label="Subject" className={`${input} mb-1.5`} placeholder="Subject" value={s.subject ?? ""} onChange={(e) => set(i, { subject: e.target.value })} />}
                    <textarea aria-label="Text" rows={4} className={input} placeholder={`Write the message. You can use ${VARS}`} value={s.text ?? ""} onChange={(e) => set(i, { text: e.target.value })} />
                  </>
                )}
                {s.mode !== "fixed" && <input aria-label="Instruction" className={`${input} mt-1.5`} placeholder="Optional instruction for this step, e.g. 'offer the free run', 'mention their launch'" value={s.instruction ?? ""} onChange={(e) => set(i, { instruction: e.target.value })} />}
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            className={Btn.ghost}
            onClick={() => {
              const last = steps[steps.length - 1];
              setSteps([...steps, { id: uid(), channel: "email", dayOffset: (last?.dayOffset ?? 0) + 3, mode: "ai" }]);
              setDirty(true);
            }}
          >
            + Add step
          </button>
          <button className={Btn.primary} disabled={!dirty || busy !== null} onClick={() => void save()}>
            {busy === "save" ? "Saving…" : "Save sequence"}
          </button>
          <button className={Btn.ghost} disabled={busy !== null || dirty} onClick={() => void redraft()} title="Rewrite drafts that are still waiting for review">
            {busy === "redraft" ? "Rewriting…" : "Rewrite waiting drafts"}
          </button>
          {msg && <span className="text-sm text-muted">{msg}</span>}
        </div>
      </section>
      <Templates t={t} reload={reload} />
    </div>
  );
}

function Templates({ t, reload }: { t: TeamState; reload: () => Promise<void> }) {
  const [list, setList] = useState<Template[]>(t.templates ?? []);
  const [open, setOpen] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, { lead: string; to: string; subject: string; body: string } | "loading" | string>>({});
  const [saving, setSaving] = useState(false);

  const update = (id: string, p: Partial<Template>) => setList(list.map((x) => (x.id === id ? { ...x, ...p } : x)));
  async function save(next = list) {
    setSaving(true);
    try {
      await post("/api/gtm", { action: "templates", templates: next });
      await reload();
    } finally {
      setSaving(false);
    }
  }
  async function run(x: Template) {
    setPreview({ ...preview, [x.id]: "loading" });
    try {
      const r = await post<{ preview: { lead: string; to: string; subject: string; body: string } }>("/api/gtm", { action: "previewTemplate", template: x });
      setPreview((p) => ({ ...p, [x.id]: r.preview }));
    } catch (e) {
      setPreview((p) => ({ ...p, [x.id]: e instanceof Error ? e.message : "Preview failed" }));
    }
  }

  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Templates</h2>
          <p className="text-sm text-muted">A structure the writer follows and personalizes for each lead. Use them in any step. Variables: {VARS}</p>
        </div>
        <button
          className={Btn.ghost}
          onClick={() => {
            const x: Template = { id: uid(), name: "New template", slot: "first", subject: "", body: "Hi {first_name},\n\n[the signal and why it matters to them]\n\n[one line on how we help]\n\n[one easy question]\n\n{sender}", instructions: "" };
            setList([x, ...list]);
            setOpen(x.id);
          }}
        >
          + New template
        </button>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted">No templates yet. Without one, the writer composes each email from the lead&apos;s signal, your personas and what it knows about your product.</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((x) => {
            const p = preview[x.id];
            return (
              <li key={x.id} className="py-3">
                <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen(open === x.id ? null : x.id)} aria-expanded={open === x.id}>
                  <span className="font-medium">{x.name}</span>
                  <span className="text-xs text-muted">{x.slot === "first" ? "First email" : x.slot === "follow_up" ? "Follow-up" : "Closing"}</span>
                </button>
                {open === x.id && (
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <div className="space-y-2">
                      <input aria-label="Name" className={input} value={x.name} onChange={(e) => update(x.id, { name: e.target.value })} />
                      <select aria-label="Kind" className={input} value={x.slot} onChange={(e) => update(x.id, { slot: e.target.value as Template["slot"] })}>
                        <option value="first">First email</option>
                        <option value="follow_up">Follow-up</option>
                        <option value="closing">Closing email</option>
                      </select>
                      {x.slot === "first" && <input aria-label="Subject" className={input} placeholder="Subject (optional)" value={x.subject ?? ""} onChange={(e) => update(x.id, { subject: e.target.value })} />}
                      <textarea aria-label="Template" rows={8} className={input} value={x.body} onChange={(e) => update(x.id, { body: e.target.value })} />
                      <textarea aria-label="Instructions" rows={3} className={input} placeholder="Instructions for the writer, e.g. 'offer the free run, keep it under 60 words, no questions about budget'" value={x.instructions} onChange={(e) => update(x.id, { instructions: e.target.value })} />
                      <div className="flex flex-wrap gap-2">
                        <button className={Btn.primary} disabled={saving} onClick={() => void save()}>
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button className={Btn.ghost} disabled={p === "loading"} onClick={() => void run(x)}>
                          {p === "loading" ? "Writing…" : "Preview on a real lead"}
                        </button>
                        <button
                          className="text-sm text-muted hover:text-rose-700"
                          onClick={() => {
                            const next = list.filter((y) => y.id !== x.id);
                            setList(next);
                            void save(next);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="rounded-xl bg-paper p-3 text-sm">
                      {!p ? (
                        <p className="text-muted">Press “Preview on a real lead” to see this template written for one of your leads. Nothing is saved or sent.</p>
                      ) : p === "loading" ? (
                        <p className="text-muted">Writing…</p>
                      ) : typeof p === "string" ? (
                        <p className="text-rose-700">{p}</p>
                      ) : (
                        <>
                          <p className="text-xs text-muted">
                            For {p.to} at {p.lead}
                          </p>
                          {p.subject && <p className="mt-1 font-medium">{p.subject}</p>}
                          <p className="mt-1 whitespace-pre-line">{p.body}</p>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
