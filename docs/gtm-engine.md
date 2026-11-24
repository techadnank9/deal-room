# GTM Engine: system design

Deal Room's team room (Maya finds buyers, Arjun writes outreach, Elena books meetings) extended into a closed-loop
go-to-market engine: product intake → ICP → discovery → knowledge graph → enrichment → approved outreach → pipeline
and analytics. Built for HackwithBay 4.0 ("Thoughtful Agents for Productivity").

- UI: `/gtm?url=<your company>` (tabs: ICP, Leads, Graph, Approvals, Pipeline, Analytics, plus the live "Agent thinking" feed).
  `?tab=graph` etc. opens a tab directly. The 3D team room at `/team` drives the same state by voice.
- API: `GET /api/gtm?url=` (state + analytics + billing; `&graph=1` runs the graph queries), `POST /api/gtm` with an `action`.
- Code: `lib/gtm/engine.ts` (all five modules), `lib/gtm/types.ts` (data model), `lib/sponsors/moss.ts`, `lib/sponsors/flexprice.ts`.

## Architecture

```
            ┌──────────── /team (3D room, voice) ────────────┐        ┌──────── /gtm (dense operating surface) ────────┐
            │ Maya · Arjun · Elena                            │        │ ICP · Leads · Graph · Approvals · Pipeline ·    │
            └───────────────┬────────────────────────────────┘        │ Analytics · Agent thinking · Moss search · $    │
                            │ /api/team                                └──────────────────┬─────────────────────────────┘
                            ▼                                                             │ /api/gtm
   ┌──────────────────────────────────────── lib/agents/team.ts + lib/gtm/engine.ts ──────┴───────────────────────────┐
   │ 1 Intake→ICP   2 Discovery+competitors   3 Graph queries   4 Enrich + sequence + HITL gate   5 Stages + analytics │
   └───┬───────────────┬──────────────────┬──────────────────┬──────────────────┬───────────────────┬────────────────┘
       │ LLM (OpenAI / │ Telem web search │ Glasser company  │ Moss in-process  │ Flexprice usage   │ Postgres/SQLite
       │ Claude, JSON  │ + page fetch     │ + people data,   │ semantic index   │ events + prepaid  │ kv: team state
       │ schema output)│ (citations)      │ DNS MX checks    │ (<10 ms queries) │ wallet (gating)   │ per company
```

All state for one company lives in one record (`team-state:<domain>`): leads, ICP, competitors, sequences, stage
history and the activity log. Concurrent writers (you talking in the room while background enrichment runs) merge
instead of overwriting (`saveTeam`).

## Module 1: intake and ICP

`buildIcp(intake)` takes four plain-language fields (product and constraints, reference customers, pricing, regions and
deal-breakers) plus what Maya already read on the company's own site. One structured-output call returns:

| Field | Shape |
|---|---|
| industries | name + NAICS code + confidence |
| companySize | headcount band, revenue band, confidence |
| personas | title, seniority, function, confidence |
| triggers | observable buying events, confidence |
| regions | name, confidence |
| negativeSignals | explicit disqualifiers |
| expansions | adjacent segments with reasoning and evidence; you Accept or Dismiss each |

Confidence is 0.00–1.00 per field: high only when the intake states it, low when extrapolated. `applyIcp` compiles the
core ICP, accepted expansions and the disqualifiers into the brief every lead hunt uses, and clears old search angles so
hunting follows the new profile.

## Module 2: discovery and competitors

- **Buyers** (`teamTurn` → `find_leads`): Maya writes buying-signal queries (funding, hiring for the role that has the
  problem, launches), searches the live web with Telem, and the model picks up to 5 real companies from the results.
  Every lead carries the `sourceUrl` it came from. Guards against hallucinated or wrong leads: own company removed,
  competitors removed twice (a flag in the pick, then a separate competitor judge), rejected companies remembered,
  direct competitors from the landscape map excluded.
- **Competitors** (`mapCompetitors`): two searches (alternatives, pricing), then direct / indirect / alternative entries
  with positioning, public pricing, their edge vs ours and a mandatory source URL. Direct competitors are added to the
  exclusion list so they never come back as leads.

## Module 3: knowledge graph

`graph()` builds a property graph from the stored entities on every query and runs multi-hop reasoning over it.

**Nodes:** `Product` (us), `Company` (leads), `Customer` (reference wins from intake), `Person`, `Competitor`, `Signal`.

**Edges:** `works_at` (Person→Company), `previously_employed_at` (Person→Company), `competes_with` (Competitor→Product),
`matched_to` (Company/Customer→Product), `has_signal` (Company→Signal), `contacted_via` (Product→Person, after an
approved send), `replied_to` (Person→Product), `lookalike_of` (Company→Customer, from Moss similarity).

**Queries:**
1. *Warm intro paths*: breadth-first search from our Product to each lead, excluding direct match, our own outreach and
   similarity edges, so a path only exists through a real relationship (a reference customer where the buyer used to
   work, a shared employer). Paths of 2–4 hops are returned with the chain of names.
2. *Lookalikes*: for each reference customer, a Moss semantic query over the leads; strong matches become
   `lookalike_of` edges and a ranked list.
3. *Competitor displacement*: leads whose buying signals mention a mapped competitor (migration, renewal, churn).

Each graph evaluation is metered in Flexprice as `graph_query`. The graph is rebuilt from current state on every call,
so new signals and contacts show up as soon as enrichment lands (the "continuous signal ingestion" requirement); every
newly found lead is enriched in the background automatically.

Why not Neo4j: within an 8-hour build, a graph store that needs no extra service keeps the demo deployable on one
Render web service. The node labels, edge types and the queries above map one to one onto Cypher
(`MATCH p=shortestPath((:Product)-[*..4]-(c:Company {id:$id})) WHERE none(r IN relationships(p) WHERE type(r) IN [...])`)
if the data outgrows memory.

## Module 4: enrichment and outreach

**Enrichment** (`enrichLead`), credit-gated:
1. Flexprice gate: if the wallet's real-time balance is below the price of one enrichment ($0.50) the lead is marked
   `blocked` and the agent logs why. Nothing is called.
2. In parallel: Glasser company record (size, funding, industry, HQ, tech stack) + decision-makers filtered by the ICP
   personas; a DNS MX lookup on the company domain; a news search for recent signals.
3. Glasser masks surnames, so the top 3 people are resolved with one web search each: full name, LinkedIn URL (kept
   only if the URL slug matches the name) and previous employers, accepted only when a result names that person at
   that company.
4. Emails: provider email if present, else `first.last@domain` pattern; status `mx-valid` / `guessed` / `no-mx` / `unknown`,
   shown as a coloured dot in every grid row.
5. Scoring: fit (firmographics vs ICP) and intent (strength and recency of cited signals), each 0–100;
   score = 0.6·fit + 0.4·intent; Tier A ≥ 75, B ≥ 55, else C.
6. Metered as `lead_enriched`; leads, signals and people are indexed in Moss.

**Outreach** (`draftSequence`): Arjun pulls the most relevant facts about the company from Moss (latency logged), picks
the contact with a deliverable address, and writes 3 touches: email (day 0), LinkedIn note (day 1), follow-up email
(day 4). Tone and length follow the persona's seniority; one concrete trigger signal is named; the signal URLs are
attached as citations. Messages are signed by the rep, never by the agent. Sequences alternate between variant A
(15-minute call) and B (2-minute teardown video) for split testing.

**Human-in-the-loop gate** (`decideTouch`): every touch is `pending` until a rep approves, edits or rejects it in the
Approvals tab. Only an approval queues the message, meters `outreach_sent`, and moves the lead to Contacted. Voice
requests in the room ("Arjun, write to Quo") go through the same queue.

## Module 5: pipeline and analytics

- Stages: Matched → Contacted → Replied → Meeting booked → Closed won / Closed lost. Drag cards on the Kanban board.
- Every stage change appends `{at, stage, actor: agent|rep, who, note}` to the lead's audit trail and to the activity
  log, so AI-driven progress (Maya matched, Elena booked) is always distinguishable from rep actions (approved, moved).
- Analytics: funnel with stage-to-stage conversion, segments by industry and tier, variant × channel split test
  (drafted, approved, replied), agent vs rep action counts, and billed usage per metered event.

## Moss (retrieval layer)

`lib/sponsors/moss.ts`. One shared index (`gtm-engine`), every document tagged with its company domain and a `kind`
(`lead`, `signal`, `person`, `competitor`, `message`, `icp`). The index loads into the server process, so queries run
locally in single-digit milliseconds (measured 1.7–15 ms). Used for:
- Arjun's grounding before drafting (top facts about the account),
- reference-customer lookalikes in the graph,
- the global search box over everything the agents found.

A local mirror answers queries for documents added since the last load, and stands in entirely if Moss is unreachable.
`POST /api/gtm {action:"reindex"}` rebuilds the index from stored state.

## Flexprice (usage-based billing)

`scripts/flexprice-setup.mjs` (idempotent) creates the billing model through the API:

| Feature (event) | Meter | Price |
|---|---|---|
| Leads Enriched (`lead_enriched`) | COUNT | $0.50 |
| Outreach Sent (`outreach_sent`) | COUNT | $0.25 |
| Graph Queries Evaluated (`graph_query`) | COUNT | $0.02 |
| Moss Searches (`search_query`) | COUNT | $0.01 |

…a plan with those usage prices, the workspace customer (`dealroom-demo`), a monthly subscription and a prepaid USD
wallet with starter credits. At runtime `meter()` posts each event to `/v1/events` with the lead and channel as
properties; `balance()` reads the wallet's real-time balance (usage already netted out) and `canSpend()` gates
enrichment. The header shows live credits with +$10 top-up and a "drain" button that spends the balance to demo the
gate. Each per-lead cost appears in the activity log and in the Analytics usage table.

## Setup

```bash
npm install
# .env.local: OPENAI_API_KEY, TELEM_API_KEY, GLASSER_API_KEY, DATABASE_URL (optional; SQLite otherwise),
#             FLEXPRICE_API_KEY, MOSS_PROJECT_ID, MOSS_PROJECT_KEY
node --env-file=.env.local scripts/flexprice-setup.mjs   # once
npm run dev                                              # then open /team, enter your company, then /gtm
```

Every external service is optional: without a key the module falls back (local ledger for Flexprice, keyword index for
Moss, model mocks) so the pipeline still runs end to end.

## Demo script (2–3 min)

1. `/team`: enter the company URL. Maya says what you sell and who buys it.
2. `/gtm` → ICP: paste the intake, Generate ICP (confidences, NAICS, disqualifiers); accept one expansion; Map competitors.
3. Room or Leads: "Maya, find leads that match our ICP" → leads with source links; background enrichment fills
   contacts, MX dots, signals, Tier and score; each enrichment costs $0.50 in the Flexprice header.
4. Search box: "who is hiring test automation engineers" → Moss hits in a few ms.
5. Lead panel → Draft outreach → Approvals: edit a line, Approve & send (charged $0.25, lead moves to Contacted).
6. Graph: warm paths, lookalikes, displacement. Pipeline: drag to Replied / Meeting. Analytics: funnel, split test,
   AI vs rep actions.
7. Press "drain", try Enrich: blocked by credits. Top up, it runs again.
