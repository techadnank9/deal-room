export type SponsorKey = "bruin" | "band" | "telem" | "glasser" | "runware" | "claude";
export type TagKey = SponsorKey | "app" | "browser" | "room" | "store" | "memory";

export const TAGS: Record<TagKey, { label: string; color: string; sponsor: boolean }> = {
  bruin: { label: "Bruin", color: "#2563eb", sponsor: true },
  band: { label: "BAND", color: "#0f766e", sponsor: true },
  telem: { label: "Telem", color: "#c2410c", sponsor: true },
  glasser: { label: "Glasser", color: "#7c3aed", sponsor: true },
  runware: { label: "Runware", color: "#db2777", sponsor: true },
  claude: { label: "Claude", color: "#16140f", sponsor: true },
  app: { label: "Deal Room", color: "#6f695f", sponsor: false },
  browser: { label: "Browser", color: "#6f695f", sponsor: false },
  room: { label: "3D room", color: "#6f695f", sponsor: false },
  store: { label: "Event store", color: "#6f695f", sponsor: false },
  memory: { label: "Memory", color: "#6f695f", sponsor: false },
};

export const EXECS = [
  { key: "cfo", label: "CFO", color: "#c2410c" },
  { key: "tech", label: "Tech lead", color: "#0f766e" },
  { key: "procurement", label: "Procurement", color: "#7c3aed" },
] as const;

export type Lane = {
  id: string;
  index: string;
  title: string;
  endpoint: string;
  blurb: string;
  rows: number;
  /** Text on the handoff strip drawn below this lane. */
  handoff?: string;
};

export const LANES: Lane[] = [
  {
    id: "start",
    index: "01",
    title: "Session start",
    endpoint: "POST /api/session",
    blurb: "Research the account, build the committee, open the channels.",
    rows: 3,
    handoff: "The room opens with three executives at the table. You start talking.",
  },
  {
    id: "turn",
    index: "02",
    title: "Each turn",
    endpoint: "POST /api/turn",
    blurb: "Every sentence is fact checked, then the committee reacts. Repeats every turn.",
    rows: 3,
    handoff: "You end the call.",
  },
  {
    id: "verdict",
    index: "03",
    title: "Verdict",
    endpoint: "POST /api/verdict",
    blurb: "Each executive votes, a coach writes the fixes, the pipeline runs.",
    rows: 1,
    handoff: "bruin run loads the events into DuckDB and builds the marts.",
  },
  {
    id: "bruin",
    index: "04",
    title: "Bruin pipeline",
    endpoint: "bruin/deal_room/",
    blurb: "Raw events become tested tables. The score and history pages read only these.",
    rows: 2,
  },
];

export type FlowNode = {
  id: string;
  lane: string;
  col: number;
  row: number;
  span?: number;
  tag: TagKey;
  title: string;
  sub: string;
  files: string[];
  detail: string;
  execGroup?: boolean;
};

export const NODES: FlowNode[] = [
  // 01 Session start
  {
    id: "s_trigger",
    lane: "start",
    col: 0,
    row: 1,
    tag: "app",
    title: "You name a prospect",
    sub: "URL + what you sell",
    files: ["app/api/session/route.ts"],
    detail:
      "The rehearsal starts from a real company website. The session route fans out to research, enrichment and memory in parallel with Promise.all.",
  },
  {
    id: "s_telem",
    lane: "start",
    col: 1,
    row: 0,
    tag: "telem",
    title: "Live web research",
    sub: "/v1/fetch + /v1/search",
    files: ["lib/sponsors/telem.ts"],
    detail:
      "POST router.telem.ai/v1/fetch reads the prospect's site, and /v1/search pulls recent news, job posts, funding and customers. Every result keeps its source URL. If Telem is down, a direct homepage fetch is the fallback.",
  },
  {
    id: "s_glasser",
    lane: "start",
    col: 1,
    row: 1,
    tag: "glasser",
    title: "Company intel",
    sub: "funding, stack, people",
    files: ["lib/sponsors/glasser.ts"],
    detail:
      "company_intelligence enrich gives size and funding, tech_stack gives the tools they already run, and people_search finds the likely titles who would sit on the buying committee.",
  },
  {
    id: "s_memory",
    lane: "start",
    col: 1,
    row: 2,
    tag: "memory",
    title: "Past rehearsals",
    sub: "claims that failed before",
    files: ["app/api/session/route.ts"],
    detail:
      "accountMemory() summarises earlier finished rehearsals against the same account. The executives remember which of your claims failed last time, so their decisions change across sessions.",
  },
  {
    id: "s_personas",
    lane: "start",
    col: 2,
    row: 1,
    tag: "claude",
    title: "Brief + 3 personas",
    sub: "objections cite sources",
    files: ["lib/agents/personas.ts"],
    detail:
      "One Claude call turns research, enrichment and memory into the account brief plus three personas: CFO, tech lead and procurement. Each objection a persona holds cites a research source URL.",
  },
  {
    id: "s_band",
    lane: "start",
    col: 3,
    row: 0,
    tag: "band",
    title: "Room per session",
    sub: "5 agents join the chat",
    files: ["lib/sponsors/band.ts"],
    detail:
      "Opens a BAND chat room for the session with five agents: director, cfo, tech, procurement and analyst. All agent to agent traffic in the call goes through this room.",
  },
  {
    id: "s_runware",
    lane: "start",
    col: 3,
    row: 1,
    tag: "runware",
    title: "Portraits + backdrop",
    sub: "generated in background",
    files: ["lib/sponsors/runware.ts", "app/api/image/route.ts"],
    detail:
      "Generates a portrait for each executive persona and the window backdrop behind the table. Runs in the background so the room opens without waiting.",
  },
  {
    id: "s_events",
    lane: "start",
    col: 3,
    row: 2,
    tag: "store",
    title: "session_started",
    sub: "SQLite or Postgres",
    files: ["lib/db.ts"],
    detail:
      "Writes the session_started event to the events table: SQLite locally, Postgres when DATABASE_URL is set. Finished sessions in this table are what memory reads next time.",
  },

  // 02 Each turn
  {
    id: "t_speak",
    lane: "turn",
    col: 0,
    row: 0,
    tag: "browser",
    title: "You speak",
    sub: "hold Space, Web Speech",
    files: ["lib/voice.ts"],
    detail:
      "Hold Space and talk. The browser Web Speech API transcribes you, and the text is posted to /api/turn.",
  },
  {
    id: "t_claims",
    lane: "turn",
    col: 1,
    row: 0,
    tag: "claude",
    title: "Claim extractor",
    sub: "pulls checkable claims",
    files: ["lib/agents/claims.ts"],
    detail:
      "Claude reads what you just said and pulls out the factual claims worth checking, such as numbers, customers and integrations.",
  },
  {
    id: "t_handoff",
    lane: "turn",
    col: 2,
    row: 0,
    tag: "band",
    title: "director → @analyst",
    sub: "each claim handed over",
    files: ["lib/sponsors/band.ts", "app/api/turn/route.ts"],
    detail:
      "The director agent posts each claim into the BAND room with an @analyst mention, so the hand-off between agents is visible as real messages.",
  },
  {
    id: "t_analyst",
    lane: "turn",
    col: 3,
    row: 0,
    tag: "telem",
    title: "Analyst fact check",
    sub: "verdict + source URL",
    files: ["app/api/turn/route.ts", "lib/sponsors/telem.ts"],
    detail:
      "The analyst runs Telem /v1/search plus the account brief and judges each claim verified, unsupported or contradicted, always with a source URL.",
  },
  {
    id: "t_wall",
    lane: "turn",
    col: 4,
    row: 0,
    tag: "room",
    title: "Wall screen",
    sub: "fact checks shown live",
    files: ["components/room/WallScreen.tsx"],
    detail: "The fact check result appears on the screen on the wall of the 3D room while the executives react.",
  },
  {
    id: "t_execs",
    lane: "turn",
    col: 3,
    row: 1,
    span: 2,
    tag: "claude",
    title: "Three executives",
    sub: "in parallel, on Claude",
    files: ["lib/agents/executive.ts"],
    execGroup: true,
    detail:
      "CFO, tech lead and procurement run in parallel. Each sees the transcript, its persona, the private BAND messages addressed to it and the fact checks. Each returns a private thought, an optional private message, urge to speak, a spoken line, a conviction delta, a gesture and a reason.",
  },
  {
    id: "t_private",
    lane: "turn",
    col: 4,
    row: 1,
    tag: "band",
    title: "Private whispers",
    sub: "@mention one recipient",
    files: ["lib/sponsors/band.ts"],
    detail:
      "When an executive wants a side conversation, the message goes over BAND with an @mention of only the recipient. Only that executive sees it on the next turn, and the 3D characters lean in to whisper.",
  },
  {
    id: "t_director",
    lane: "turn",
    col: 4,
    row: 2,
    tag: "app",
    title: "Director picks",
    sub: "highest urge to speak",
    files: ["app/api/turn/route.ts"],
    detail: "The director compares urge to speak across the three executives and gives the floor to the highest.",
  },
  {
    id: "t_voice",
    lane: "turn",
    col: 5,
    row: 2,
    tag: "room",
    title: "Voice + gesture",
    sub: "per-agent voice, R3F",
    files: ["lib/voice.ts", "components/room/Executive.tsx", "components/room/Scene.tsx"],
    detail:
      "The chosen line is spoken with a different browser voice per executive. Gestures and whispers animate rigged GLB characters (generated with Meshy) in React Three Fiber.",
  },
  {
    id: "t_events",
    lane: "turn",
    col: 5,
    row: 0,
    tag: "store",
    title: "Every step logged",
    sub: "claims, thoughts, deltas",
    files: ["lib/db.ts", "components/room/DecisionLog.tsx"],
    detail:
      "Claims, fact checks, private thoughts, whispers, spoken lines and conviction changes are each written as events. The decision log in the room reads the same stream.",
  },

  // 03 Verdict
  {
    id: "v_end",
    lane: "verdict",
    col: 0,
    row: 0,
    tag: "app",
    title: "You end the call",
    sub: "POST /api/verdict",
    files: ["app/api/verdict/route.ts"],
    detail: "Ending the call asks the committee for a decision.",
  },
  {
    id: "v_votes",
    lane: "verdict",
    col: 1,
    row: 0,
    tag: "claude",
    title: "Each exec votes",
    sub: "buy / pass + decisive turn",
    files: ["lib/agents/verdict.ts"],
    detail: "Each executive votes buy or pass on Claude, with a reason and the turn that decided it.",
  },
  {
    id: "v_coach",
    lane: "verdict",
    col: 2,
    row: 0,
    tag: "claude",
    title: "Coach",
    sub: "three things to fix",
    files: ["lib/agents/coach.ts"],
    detail: "A coach reads the call and the votes and writes the three things to fix before the real meeting.",
  },
  {
    id: "v_events",
    lane: "verdict",
    col: 3,
    row: 0,
    tag: "store",
    title: "Vote events",
    sub: "three votes written",
    files: ["lib/db.ts"],
    detail: "The three votes are written to the events table, which closes the session.",
  },
  {
    id: "v_run",
    lane: "verdict",
    col: 4,
    row: 0,
    tag: "bruin",
    title: "bruin run",
    sub: "spawned by the app",
    files: ["lib/bruin.ts"],
    detail: "lib/bruin.ts spawns `bruin run` on the deal_room pipeline as soon as the votes are stored.",
  },

  // 04 Bruin
  {
    id: "b_raw",
    lane: "bruin",
    col: 0,
    row: 0,
    tag: "bruin",
    title: "raw.events",
    sub: "ingestr → DuckDB",
    files: ["bruin/deal_room/assets/raw.events.asset.yml"],
    detail: "An ingestr asset copies the app's events table into DuckDB.",
  },
  {
    id: "b_checks",
    lane: "bruin",
    col: 0,
    row: 1,
    tag: "bruin",
    title: "29 quality checks",
    sub: "run on every asset",
    files: ["bruin/deal_room/assets/"],
    detail:
      "Every finished session has exactly three votes, no null actors, actors and event types in accepted values, conviction between 0 and 100, loss_rate between 0 and 1, and more.",
  },
  {
    id: "b_conv",
    lane: "bruin",
    col: 1,
    row: 0,
    tag: "bruin",
    title: "conviction_timeline",
    sub: "mart, per exec per turn",
    files: ["bruin/deal_room/assets/mart.conviction_timeline.sql"],
    detail: "Conviction of each executive after every turn, built from raw.events.",
  },
  {
    id: "b_claims",
    lane: "bruin",
    col: 1,
    row: 1,
    tag: "bruin",
    title: "claim_outcomes",
    sub: "mart, per claim",
    files: ["bruin/deal_room/assets/mart.claim_outcomes.sql"],
    detail: "Every claim you made and whether it was verified, unsupported or contradicted.",
  },
  {
    id: "b_obj",
    lane: "bruin",
    col: 2,
    row: 0,
    tag: "bruin",
    title: "objections_by_type",
    sub: "depends on timeline",
    files: ["bruin/deal_room/assets/mart.objections_by_type.sql"],
    detail: "Which kinds of objection cost you the most conviction. Depends on conviction_timeline.",
  },
  {
    id: "b_score",
    lane: "bruin",
    col: 2,
    row: 1,
    tag: "bruin",
    title: "session_scorecard",
    sub: "depends on claims + raw",
    files: ["bruin/deal_room/assets/mart.session_scorecard.sql"],
    detail: "One row per session: votes, outcome and claim quality. Depends on raw.events and claim_outcomes.",
  },
  {
    id: "b_trends",
    lane: "bruin",
    col: 3,
    row: 0,
    tag: "bruin",
    title: "user_trends",
    sub: "across all sessions",
    files: ["bruin/deal_room/assets/mart.user_trends.sql"],
    detail: "How you improve across rehearsals, including loss_rate. Depends on objections_by_type and session_scorecard.",
  },
  {
    id: "b_history",
    lane: "bruin",
    col: 4,
    row: 0,
    tag: "app",
    title: "/history",
    sub: "reads user_trends",
    files: ["app/history/page.tsx", "app/api/history/route.ts"],
    detail: "The history page reads the Bruin tables in DuckDB, not the raw events.",
  },
  {
    id: "b_page",
    lane: "bruin",
    col: 4,
    row: 1,
    tag: "app",
    title: "/score/[id]",
    sub: "reads session_scorecard",
    files: ["app/score/[id]/page.tsx", "app/api/score/route.ts"],
    detail: "The scorecard page reads the Bruin tables in DuckDB, not the raw events.",
  },
];

export type FlowEdge = {
  from: string;
  to: string;
  route?: "side" | "down" | "up" | "below";
  dashed?: boolean;
  both?: boolean;
  label?: string;
};

export const EDGES: FlowEdge[] = [
  { from: "s_trigger", to: "s_telem" },
  { from: "s_trigger", to: "s_glasser" },
  { from: "s_trigger", to: "s_memory" },
  { from: "s_telem", to: "s_personas" },
  { from: "s_glasser", to: "s_personas" },
  { from: "s_memory", to: "s_personas" },
  { from: "s_personas", to: "s_band" },
  { from: "s_personas", to: "s_runware" },
  { from: "s_personas", to: "s_events" },
  { from: "s_events", to: "s_memory", route: "below", dashed: true, label: "next rehearsal" },

  { from: "t_speak", to: "t_claims" },
  { from: "t_claims", to: "t_handoff" },
  { from: "t_handoff", to: "t_analyst" },
  { from: "t_analyst", to: "t_wall" },
  { from: "t_analyst", to: "t_execs", route: "down" },
  { from: "t_execs", to: "t_private", both: true },
  { from: "t_execs", to: "t_director" },
  { from: "t_director", to: "t_voice" },
  { from: "t_wall", to: "t_events" },
  { from: "t_voice", to: "t_events", route: "up" },
  { from: "t_voice", to: "t_speak", route: "below", dashed: true, label: "next turn" },

  { from: "v_end", to: "v_votes" },
  { from: "v_votes", to: "v_coach" },
  { from: "v_coach", to: "v_events" },
  { from: "v_events", to: "v_run" },

  { from: "b_raw", to: "b_conv" },
  { from: "b_raw", to: "b_claims" },
  { from: "b_conv", to: "b_obj" },
  { from: "b_claims", to: "b_score" },
  { from: "b_obj", to: "b_trends" },
  { from: "b_score", to: "b_trends" },
  { from: "b_trends", to: "b_history" },
  { from: "b_score", to: "b_page" },
];

export const SPONSOR_INFO: { key: SponsorKey; role: string; uses: { what: string; file: string }[] }[] = [
  {
    key: "telem",
    role: "Live web research on the prospect, and the analyst's fact checks during the call.",
    uses: [
      { what: "/v1/fetch on the site, /v1/search for news, jobs, funding", file: "lib/sponsors/telem.ts" },
      { what: "Analyst checks each claim with /v1/search", file: "app/api/turn/route.ts" },
    ],
  },
  {
    key: "glasser",
    role: "Company size, funding and tech stack, plus who is likely in the room.",
    uses: [{ what: "company_intelligence, tech_stack, people_search", file: "lib/sponsors/glasser.ts" }],
  },
  {
    key: "claude",
    role: "Every reasoning step: brief, personas, claims, three executives, votes, coach.",
    uses: [
      { what: "Brief + three personas with cited objections", file: "lib/agents/personas.ts" },
      { what: "Claim extraction each turn", file: "lib/agents/claims.ts" },
      { what: "Three executives in parallel each turn", file: "lib/agents/executive.ts" },
      { what: "Votes, then the coach's three fixes", file: "lib/agents/verdict.ts" },
    ],
  },
  {
    key: "band",
    role: "The agents' chat room: director to analyst hand-offs and private @mention whispers.",
    uses: [{ what: "Room per session with five agents, @mentions", file: "lib/sponsors/band.ts" }],
  },
  {
    key: "runware",
    role: "Executive portraits and the window backdrop, generated per account.",
    uses: [{ what: "Portrait per persona, backdrop, in the background", file: "lib/sponsors/runware.ts" }],
  },
  {
    key: "bruin",
    role: "Turns raw call events into tested tables that power the score and history pages.",
    uses: [
      { what: "`bruin run` after every verdict", file: "lib/bruin.ts" },
      { what: "ingestr asset, five marts, 29 checks", file: "bruin/deal_room/" },
    ],
  },
];
