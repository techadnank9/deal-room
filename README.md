# Deal Room

Rehearse a sales call against an AI buying committee built from real data about your prospect.

Paste a prospect URL and one line about what you sell. Three executives (CFO, tech lead, procurement), grounded in live research on that company, walk into a 3D meeting room. You pitch by voice. They push back with objections that cite sources, an analyst fact-checks every number you say on the wall screen, they message each other privately, and then they vote. Buyers walk over and shake your hand; the others walk out. You get a scorecard with evidence, built by a Bruin pipeline.

## Run it

```bash
npm install
cp .env.example .env.local   # add keys; every sponsor key is optional (mock fallback)
curl -LsSf https://getbruin.com/install/cli | sh   # Bruin CLI (installs to ~/.local/bin)
npm run dev
```

Open http://localhost:3000. Hold **Space** to talk (Chrome), or type.

Without `ANTHROPIC_API_KEY` the agents fall back to scripted heuristics so the app still runs end to end.

## How it works

```
                    POST /api/session
 prospect URL ──► Telem (site, news, jobs) ─┐
                  Glasser (size, funding,   ├─► Claude: account brief + 3 personas
                  tech stack, titles)       │    (objections cite source URLs)
                  memory of past sessions ──┘
                  BAND: open room (director, cfo, tech, procurement, analyst)
                  Runware: portraits + window backdrop (background)

                    POST /api/turn   (x8 or until you end the call)
 your line ──► Claude claim extractor ──► director @analyst over BAND
                                           analyst: Telem search + brief → verified / unsupported / contradicted
           ──► 3 executives in parallel (Claude): private thought, private message (BAND @mention),
               urge to speak, spoken line, conviction delta, gesture, reason
           ──► director picks highest urge → line spoken with that agent's voice, gestures animate in 3D
           ──► every step written to the events table

                    POST /api/verdict
 votes (buy/pass, reason, decisive turn) + coach's 3 fixes ──► events ──► `bruin run`

                    Bruin (bruin/deal_room)
 raw.events (ingestr: app DB → DuckDB)
   ├─ mart.conviction_timeline ─► mart.objections_by_type ─┐
   └─ mart.claim_outcomes ─────► mart.session_scorecard ───┴─► mart.user_trends
 29 quality checks. /score/[id] and /history read these tables, not the raw events.
```

See the interactive version at `/how-it-works`.

## Sponsor tools and exactly where they are used

| Tool | What it does in Deal Room | Code |
|---|---|---|
| **Bruin** | Pipeline from raw session events to scorecard and trend tables, with quality checks: every finished session has exactly 3 votes, no null actors, accepted actors/event types, conviction within 0–100, loss rate within 0–1. Runs after every verdict. | `bruin/deal_room/` (assets), `lib/bruin.ts` (runs `bruin run`, reads DuckDB), `app/api/verdict/route.ts`, `app/score/[id]/page.tsx`, `app/api/history/route.ts` |
| **BAND** | One chat room per session with director, CFO, tech, procurement and analyst agents. Whispers go from the whispering executive with an @mention of only the recipient; claims are handed to the analyst (`@analyst`) and results returned to the director. | `lib/sponsors/band.ts`, `app/api/session/route.ts` (open room), `app/api/turn/route.ts` (claim handoff, whispers) |
| **Telem** | Account research at session start (`/v1/fetch` on the prospect site, `/v1/search` for news, hiring, funding/customers) and live web search for each claim the analyst checks. | `lib/sponsors/telem.ts`, `lib/agents/claims.ts` |
| **Glasser** | Company enrichment (employees, funding via `enrich`; `tech_stack`) and `people_search` for real titles at the prospect, fed into persona generation. | `lib/sponsors/glasser.ts`, `app/api/session/route.ts` |
| **Runware** | Generated executive portraits (brief and scorecard cards) and the window backdrop in the 3D room. | `lib/sponsors/runware.ts`, `app/api/session/route.ts`, `app/api/image/route.ts` |
| **Claude** (Anthropic SDK) | Personas, claim extraction, analyst judgement, three executives per turn in parallel, votes, coaching. Model from `LLM_MODEL` (default `claude-haiku-5-5`), structured outputs. With only `OPENAI_API_KEY` set, the same calls run on OpenAI (`OPENAI_MODEL`) with strict JSON schema outputs. | `lib/llm.ts`, `lib/agents/*` |

Every sponsor module has a mock fallback so the app runs when a key is missing; the provider actually used is recorded in the `session_started` event and shown on the brief page.

## Hackathon requirements

- **3+ agents as visible 3D characters with their own goals:** CFO, tech lead, procurement (plus the analyst), rigged characters generated with Meshy, in a React Three Fiber room (`components/room/`). Personas have their own priorities, objections and conviction.
- **They move and act:** entrance walk, speaker camera, nod / head shake / arms crossed / lean in, whispering pairs lean together, buyers walk over to shake hands, others walk out.
- **Decision log:** the right-hand panel in the room shows every private thought, conviction change with its reason, fact check, whisper (content hidden until the scorecard), floor decision and vote.
- **Voices:** push-to-talk speech in (Web Speech API), a different browser voice per executive out (`lib/voice.ts`).
- **Memory that changes decisions over time:** a new session against an account you rehearsed before loads the earlier votes and failed claims into the personas (`accountMemory` in `app/api/session/route.ts`), and `/history` shows your weakest objection types across sessions from `mart.user_trends`.

## Layout

```
app/            pages (landing, /new, /brief, /room, /score, /history, /how-it-works) and API routes
components/     room (Scene, Executive, CameraRig, WallScreen, DecisionLog), landing, how
lib/agents/     personas, executive turn + director, claims + analyst, verdict, coach
lib/sponsors/   telem, band, glasser, runware (each with a mock)
lib/db.ts       events table (Postgres via DATABASE_URL, else SQLite at data/dealroom.db)
bruin/          Bruin pipeline
public/models/  rigged GLB characters
```

All code was written during the hackathon.
