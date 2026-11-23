# Sponsor tool research (official docs only)

Researched 2026-11-23. Every fact links to the doc page it came from. "NOT FOUND in docs" means I looked and the official page did not say. Lines marked *(built from schema)* are my assembly of documented fields, not an example copied from the docs.

| Sponsor | Docs quality | Server-side use from Next.js |
|---|---|---|
| Bruin | Clear | CLI, run as a subprocess or out of band |
| BAND | Clear (REST + WebSocket), with one base-URL inconsistency | REST with `X-API-Key` |
| Telem | Clear | REST or `@telemai/sdk` |
| Glasser | Clear (OpenAPI-backed) | REST with Bearer + `idempotency-key` |
| Runware | Clear | REST or `@runware/sdk` |

---

## 1. Bruin (data pipeline CLI)

### Install (macOS)
```bash
curl -LsSf https://getbruin.com/install/cli | sh
# system-wide:
curl -LsSf https://getbruin.com/install/cli | sudo sh -s -- -b /usr/local/bin
```
Homebrew is **deprecated**. If you installed Bruin with brew before, uninstall it first. Source: https://getbruin.com/docs/bruin/getting-started/introduction/installation.html

### `bruin init` and project layout
- Usage: `bruin init [template] [folder] [--in-place] [--merge]`. Templates include `default`, `duckdb`, `python`, `clickhouse`, `athena`, `chess`. With no arguments it opens an interactive picker. Source: https://getbruin.com/docs/bruin/commands/init.html
- Layout: `.bruin.yml` (environments and connections) always sits at the **project root**. Each pipeline folder has `pipeline.yml` and an `assets/` folder. Source: same page.
- `.bruin.yml` is expected at the git repo root. Use `--config-file` to point elsewhere, and `bruin connections test --name <name>` to test a connection. Source: https://getbruin.com/docs/bruin/secrets/bruinyml.html

`pipeline.yml` (verbatim from the official duckdb template, https://github.com/bruin-data/bruin/blob/main/templates/duckdb/pipeline.yml):
```yaml
name: bruin-duckdb
schedule: daily
start_date: "2024-01-01"
catchup: false
default_connections:
    duckdb: "duckdb-default"
default:
    type: duckdb.sql
```

`.bruin.yml` (https://getbruin.com/docs/bruin/getting-started/introduction/quickstart.html and https://getbruin.com/docs/bruin/getting-started/templates-docs/duckdb-README.html):
```yaml
default_environment: default
environments:
  default:
    connections:
      duckdb:
        - name: "duckdb-default"
          path: "duckdb.db"          # optional: read_only: false
      postgres:
        - name: "pg-app"
          username: "pguser"
          password: "XXXX"
          host: "localhost"
          port: 5432
          database: "dev"
          ssl_mode: "allow"          # optional
          schema: "public"           # optional
      sqlite:
        - name: "sqlite"
          path: "/abs/path/my_database.db"
```
Sources: DuckDB keys https://getbruin.com/docs/bruin/platforms/duckdb.html · Postgres keys https://getbruin.com/docs/bruin/platforms/postgres.html · SQLite keys https://getbruin.com/docs/bruin/ingestion/sqlite.html

### Local connection types (no cloud warehouse needed)
- **DuckDB: supported as a full platform.** Asset types are `duckdb.sql`, `duckdb.seed` (CSV loading), `duckdb.source`, and `duckdb.sensor.query`. https://getbruin.com/docs/bruin/platforms/duckdb.html
- **Postgres: supported as a full platform.** Asset type is `pg.sql`. https://getbruin.com/docs/bruin/platforms/postgres.html
- **SQLite: ingestion source only.** The docs say "Bruin supports SQLite as a source for Ingestr assets." A `sqlite.sql` asset type is **NOT FOUND in docs**. https://getbruin.com/docs/bruin/ingestion/sqlite.html
- A single SQL asset cannot read from Postgres and DuckDB at once. To get a Postgres table into DuckDB, use an **`ingestr` asset**: `postgres` is a listed source and `duckdb` a listed destination. A Postgres-to-DuckDB example is **NOT FOUND in docs**. The asset below is built from the documented fields. https://getbruin.com/docs/bruin/assets/ingestr.html

```yaml
# assets/raw.orders.asset.yml   (built from schema)
name: raw.orders
type: ingestr
parameters:
  source_connection: pg-app
  source_table: public.orders
  destination: duckdb
```
`incremental_strategy` (`replace | append | merge | delete+insert | truncate+insert`) is documented as a legacy option. The docs recommend `materialization.strategy` for new assets.

### Asset header syntax
SQL assets use a `/* @bruin ... @bruin */` block. The keys are `name`, `type`, `connection` (defaults to the pipeline's `default_connections`), `depends`, `materialization` (`type: table` or `view`, optional `strategy`, e.g. `append`, `merge`), `columns`, `custom_checks`, `owner`, `tags`. Sources: https://getbruin.com/docs/bruin/assets/definition-schema.html and https://getbruin.com/docs/bruin/platforms/duckdb.html
```sql
/* @bruin
name: analytics.orders_daily
type: duckdb.sql          # or pg.sql for Postgres
connection: duckdb-default
depends:
  - raw.orders
materialization:
  type: table
columns:
  - name: order_id
    type: integer
    checks:
      - name: not_null
      - name: unique
custom_checks:
  - name: no null order IDs
    query: SELECT count(*) FROM analytics.orders_daily WHERE order_id IS NULL
    value: 0
    blocking: true
@bruin */
SELECT 1 AS order_id
```

### Quality checks
The built-in column checks are `accepted_values`, `negative`, `non_negative`, `not_null`, `pattern`, `positive`, `relationships` (uses `foreign_key` metadata), `unique`, `min`, and `max`. Source: https://getbruin.com/docs/bruin/quality/available_checks.html
```yaml
columns:
  - name: status
    type: varchar
    checks:
      - name: accepted_values
        value: [open, won, lost]
  - name: amount
    type: float
    checks:
      - name: min
        value: 0.0
      - name: max
        value: 100.0
  - name: code
    type: varchar
    checks:
      - name: pattern
        value: "^[A-Z][a-z]*$"
```
Custom checks go under `custom_checks`, with `name`, `description`, `query`, `value`, and `blocking`. Source: https://getbruin.com/docs/bruin/assets/definition-schema.html

### Commands
- `bruin validate [path] [flags]`. Flags: `-e/--environment`, `-o plain|json`, `--fast`, `--exclude-warnings`, `--config-file`, `--var`. https://getbruin.com/docs/bruin/commands/validate.html
- `bruin run` / `bruin run .` / `bruin run assets/x.sql` / `bruin run --only checks assets/x.sql` / `--downstream`. https://getbruin.com/docs/bruin/getting-started/introduction/quickstart.html and https://getbruin.com/docs/bruin/getting-started/templates-docs/duckdb-README.html

### Ingesting CSV or JSON files
- **Seed assets: yes.** Define them in `*.asset.yml` with a required `parameters.path` (relative to the asset file, or an http(s) URL). Supported formats are CSV, JSON, JSONL, NDJSON, Parquet, and Avro, detected by file extension. A `file_type` parameter overrides detection. The doc examples use `duckdb.seed`. A `pg.seed` type is **NOT FOUND in docs**. https://getbruin.com/docs/bruin/assets/seed.html
- **Python assets:** the header is a `"""@bruin ... @bruin"""` docstring. For materialization, define `def materialize(**kwargs)` returning a pandas or polars DataFrame, and set `connection` plus `materialization.type: table`. Dependencies go in `pyproject.toml`/`uv.lock` (preferred) or `requirements.txt`. The doc examples only use BigQuery. A DuckDB or Postgres destination and a CSV/JSON-reading example are **NOT FOUND in docs**. https://getbruin.com/docs/bruin/assets/python.html

### Minimal 2-asset DuckDB pipeline with checks
This follows the official `templates/duckdb` structure (https://github.com/bruin-data/bruin/tree/main/templates/duckdb). The names are mine.
```
bruin/
  .bruin.yml                     # duckdb-default -> path: "deal_room.db"
  deals/
    pipeline.yml                 # default_connections: { duckdb: "duckdb-default" }
    assets/
      deals.csv
      raw.deals.asset.yml
      mart.deal_summary.sql
```
```yaml
# assets/raw.deals.asset.yml
name: raw.deals
type: duckdb.seed
parameters:
  path: ./deals.csv
columns:
  - name: deal_id
    type: varchar
    checks:
      - name: not_null
      - name: unique
  - name: stage
    type: varchar
    checks:
      - name: accepted_values
        value: [lead, qualified, won, lost]
  - name: amount
    type: double
    checks:
      - name: non_negative
```
```sql
/* @bruin
name: mart.deal_summary
type: duckdb.sql
depends:
  - raw.deals
materialization:
  type: table
columns:
  - name: stage
    type: varchar
    checks:
      - name: not_null
      - name: unique
  - name: total_amount
    type: double
    checks:
      - name: min
        value: 0
custom_checks:
  - name: has rows
    query: SELECT count(*) > 0 FROM mart.deal_summary
    value: 1
@bruin */
SELECT stage, SUM(amount) AS total_amount, COUNT(*) AS deal_count
FROM raw.deals
GROUP BY stage
```
```bash
cd bruin && bruin validate deals && bruin run deals
```

---

## 2. BAND (band.ai): agent-to-agent chat rooms

**What it is:** a platform where agents and humans share **chat rooms**. Agents send through a REST "Request API" and receive through a WebSocket "Subscriptions API" (Phoenix Channels). An SDK wraps both. Docs moved from docs.thenvoi.com to https://docs.band.ai. Source: https://docs.band.ai/api/request-api-overview

### Auth
- Agent API key: `X-API-Key: <agent_key>` (acts as the agent). User API key: `X-API-Key: <user_key>`. JWT: `Authorization: Bearer <jwt>`. https://docs.band.ai/api/request-api-overview
- To get an agent key in the UI, go to **Agents → Connect remote agent** and enter a name and description. The dialog shows the **ID** and **API Key** once. https://docs.band.ai/quickstart
- Programmatic registration is available but needs a user key (the Human API `/me` requires an **Enterprise** plan) or a **Register-only** scoped key. https://docs.band.ai/api/human-api and https://docs.band.ai/security/authentication

### Base URL: inconsistent in the docs
- The overview and auth pages say `https://app.band.ai/api/v1`. https://docs.band.ai/api/request-api-overview, https://docs.band.ai/security/authentication
- The per-endpoint reference pages say `https://api.band.ai/api/v1/...`. https://docs.band.ai/api/agent-api/agent-api-messages/create-agent-chat-message.md
- Try `app.band.ai` first and fall back to the other if needed.

### SDK
- npm `@band-ai/sdk`. The quickstart pins `npm install @band-ai/sdk@2.0.1`. Python is `band-sdk`. TS usage: `Agent.create({ config: loadAgentConfig("my_agent"), ... })`, then `await agent.run()`, with credentials read from `agent_config.yaml` (`agent_id`, `api_key`). https://docs.band.ai/quickstart
- The integration-path page lists older versions (`@band-ai/sdk` 1.0.0, `band-sdk` 6.0.1), so the version pins in the docs disagree. https://docs.band.ai/connect/choose-integration-path

### Agent API endpoints (`/api/v1/agent`)
Source: https://docs.band.ai/api/agent-api

| Method | Path | Purpose |
|---|---|---|
| GET | `/agent/me` | validate key and get profile |
| GET | `/agent/peers` | list peers I can recruit |
| GET / POST | `/agent/chats` | list / create rooms |
| GET / PATCH | `/agent/chats/{id}` | get / rename a room |
| GET / POST | `/agent/chats/{id}/participants` | list / add participants |
| DELETE | `/agent/chats/{id}/participants/{pid}` | remove a participant |
| POST | `/agent/chats/{id}/messages` | send a message (**mentions required**) |
| GET | `/agent/chats/{id}/messages` | list messages by status (diagnostics) |
| GET | `/agent/chats/{id}/messages/next` | drain the backlog on startup, **not for polling** (204 when empty) |
| POST | `/agent/chats/{id}/messages/{msg_id}/processing` \| `processed` \| `failed` | message lifecycle |
| POST | `/agent/chats/{id}/events` | post tool_call / thought events (no mentions) |
| GET | `/agent/chats/{id}/context` | conversation history |

The human-side registration endpoint is `POST /api/v1/me/agents/register` with body `{"agent":{"name":"...","description":"..."}}`. The response contains `data.agent.id` and `data.credentials.api_key`, and the key is shown once. https://docs.band.ai/api/human-api/human-api-agents/register-my-agent.md

### Create a room, add agent B, message B
```bash
BASE=https://app.band.ai/api/v1
# 1. Agent A creates a room (a bare {} body returns 422)
curl -X POST $BASE/agent/chats -H "X-API-Key: $AGENT_A_KEY" -H "Content-Type: application/json" \
  -d '{"chat":{}}'
# 2. Add agent B (participant_id = user UUID or agent ID; role owner|admin|member, default member)
curl -X POST $BASE/agent/chats/$CHAT_ID/participants -H "X-API-Key: $AGENT_A_KEY" -H "Content-Type: application/json" \
  -d '{"participant":{"participant_id":"'$AGENT_B_ID'"}}'
# 3. Send to B: the mention routes the message, and B must already be in the room
curl -X POST $BASE/agent/chats/$CHAT_ID/messages -H "X-API-Key: $AGENT_A_KEY" -H "Content-Type: application/json" \
  -d '{"message":{"content":"@AgentB please price this deal","mentions":[{"id":"'$AGENT_B_ID'","name":"AgentB","handle":"agentb"}]}}'
```
Sources: https://docs.band.ai/api/agent-api (create-chat body and mention shape), https://docs.band.ai/api/agent-api/agent-api-participants/add-agent-chat-participant.md, https://docs.band.ai/api/agent-api/agent-api-messages/create-agent-chat-message.md
- Every message needs at least one mention. Without one the API returns 422 `mentions_required`. An agent cannot mention itself. The response is `{"data":{"id":...,"recipients":[...],"success":true}}`.
- **"Private/direct" messages:** a DM primitive is **NOT FOUND in docs**. Targeting works by mention: only mentioned agents are woken, and "An agent in the room that is not mentioned is not triggered and never receives the message." https://docs.band.ai/quickstart. For true privacy, create a room containing only A and B.

### Receiving and reading messages
- **Webhooks: NOT FOUND** (the WebSocket overview lists none). Registration accepts an optional `wakeup_url`/`wakeup_secret`, but their behavior is **NOT FOUND in docs**. https://docs.band.ai/api/human-api/human-api-agents/register-my-agent.md
- **WebSocket:** `wss://app.band.ai/api/v1/socket/websocket?vsn=2.0.0` (`vsn` is required). Auth goes in the `x-api-key` header or the `api_key` query param. Join with `["1","1","chat_room:{roomId}","phx_join",{}]`. Other channels: `agent_rooms:{agentId}`, `room_participants:{roomId}`, `agent_control:{agentId}`. Send a heartbeat every 30 s or the socket closes after 45 s. https://docs.band.ai/websocket/overview
- Agents only get `message_created` for text messages whose `metadata.mentions` includes them with `kind: "mention"`. Flow: `POST .../processing` to claim (a 204 means the claim was refused, so skip), then `processed`, or `failed` with `{"error":"..."}`. https://docs.band.ai/websocket/agent/chat-room.md
- Serverless Next.js note: route handlers can't hold a socket open. Use `GET /messages/next` on startup and `GET /messages` for reads. The docs warn that `/messages/next` is "not for polling".

---

## 3. Telem (telem.ai): web search and fetch for agents

### Auth
Create a key in the console (https://app.telem.ai/ → project → Issue API key). Keys start with `tlm_`. Header: `Authorization: Bearer tlm_...`. Env var: `TELEM_API_KEY`. https://docs.telem.ai/authentication/

### Endpoints
Base URL: `https://router.telem.ai`. https://docs.telem.ai/

**Search**: `POST /v1/search`
```bash
curl -X POST https://router.telem.ai/v1/search \
  -H "Authorization: Bearer $TELEM_API_KEY" -H "Content-Type: application/json" \
  -d '{"user_input":{"query":"Acme Corp Series B funding"},
       "search":{"auto_routing":"accuracy","num_results":5}}'
```
Parameters (https://docs.telem.ai/resources/search-parameters/):
- `user_input.query`: a string, or a list for a batch.
- `search.auto_routing`: `"accuracy"` is the only mode.
- `search.providers.include` / `exclude`: e.g. `["exa","brave"]`.
- `search.num_results`: 1–20, default 5, counted **per provider**.
- `search.tier`: `minimalist|default|extended|max`.
- `search.include_domains`: host names only.
- `search.published_after` / `published_before`: ISO 8601.
- `search.include_full_content`, `search.include_raw`.

Response: `{status, preprocessor_runs:[{preprocessor_name, output_payload:{results:[{rank,url,title,summary,latency_ms,...}]}}], normalized_schema_version, routing}`. https://docs.telem.ai/ and https://docs.telem.ai/quickstart/. Other optional result fields include `excerpt`, `full_content`, `publish_date`, `favicon`, and more (https://docs.telem.ai/resources/search-parameters/).

**Fetch / scrape**: `POST /v1/fetch`
```bash
curl -X POST https://router.telem.ai/v1/fetch \
  -H "Authorization: Bearer $TELEM_API_KEY" -H "Content-Type: application/json" \
  -d '{"urls":["https://example.com/about"],"options":{"tier":"default"}}'
```
- Up to **5 URLs** per call. A 6th returns 400 `over_url_cap`.
- `options.tier`: `minimalist|default|extended|max`. `options.providers` pins the provider chain.
- Content format is markdown or plain text. `inline_max_chars` defaults to 20000.
- https://docs.telem.ai/resources/fetch-parameters/

Response: `preprocessor_runs[]` has a `web_fetch` entry whose `output_payload.fetched_results[]` contains `{url,status,title,content,content_format,content_length,http_status,provider,latency_ms}`, plus `succeeded_count`/`failed_count`. A failed URL comes back as its own row and does not fail the whole call. https://docs.telem.ai/

### npm SDK
`npm install @telemai/sdk`. https://docs.telem.ai/sdks/javascript/
```ts
import { Telem } from "@telemai/sdk";            // import style NOT FOUND verbatim; class name is Telem
const telem = new Telem(process.env.TELEM_API_KEY); // new Telem() reads TELEM_API_KEY itself
const s = await telem.search("climate policy 2026", { tier: "default", providersInclude: ["exa"], numResults: 3 });
for (const r of s.results) console.log(r.url);
const f = await telem.fetch(["https://example.com/a"]);
for (const r of f.results) console.log(r.url, r.status, r.content);
```

---

## 4. Glasser (glasser.ai): company and people data

**Official site:** https://glasser.ai. It is a pay-per-call API gateway ("2,000+ API endpoints for SEO, people, company, social data") that resells providers such as Apollo, PDL, BuiltWith, Crustdata, and Ahrefs. It comes with $1 of free credit. Docs index: https://glasser.ai/docs/llms.txt. OpenAPI spec: https://glasser.ai/docs/openapi.json

### Auth
- Base URL: `https://api.glasser.ai`. Header: `Authorization: Bearer $GLASSER_API_KEY`. Keys are created at https://app.glasser.ai/keys. The key prefix is **NOT FOUND in docs**. https://glasser.ai/docs/api-reference/overview.md
- **Run-creating POSTs require an `idempotency-key` header** (use a fresh UUID per lookup). Reusing a key with different parameters returns 409.
- Free balance check: `GET /v1/balance`.

### Company enrichment by domain
`POST /v1/solutions/gtm/company_intelligence`. https://glasser.ai/docs/api-reference/solutions/gtm/company_intelligence.md
- `action`: `enrich` (default), `search`, `lookup`, `tech_stack`, `traffic`, `competitors`, `funding`, `news`, `jobs`, `ads`.
- `provider`: `auto` (default), `apollo`, `pdl`, `hunter`, `builtwith`, `ahrefs`.
- `domain`: required for every action except `search` and `lookup`. `query` is used by search and lookup.
- **Size and funding come from `enrich`; tech stack is a separate `tech_stack` call.**
  - `enrich` output includes `employees`, `employee_range_min`/`employee_range_max`, and `total_funding_usd`.
  - `funding` returns `items[]` of `{round_date, round, amount_usd, investors[], source_url}`.
  - `tech_stack` returns `output.items[]` of `{name, categories[], detection_source, first_detected_date, last_detected_date}`.
```bash
curl -X POST https://api.glasser.ai/v1/solutions/gtm/company_intelligence \
  -H "Authorization: Bearer $GLASSER_API_KEY" -H "idempotency-key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"action":"enrich","domain":"stripe.com"}'          # (built from schema)
# repeat with "action":"tech_stack" and/or "action":"funding"
```

### People and title lookup
`POST /v1/solutions/gtm/people_search`. https://glasser.ai/docs/api-reference/solutions/gtm/people_search.md
- `action`: `search` (default), `list_employees`, `enrich`, `find_email`, `verify_email`, `find_phone`.
- `provider`: `auto`, `apollo`, `pdl`, `leadmagic`, `zoominfo`, `hunter`, `prospeo`.
- Filters: `job_titles` (1–20), `seniorities`, `locations`, `company_domain`, `keywords`, `full_name`, `email`, `linkedin_url`, `limit` (1–100).
- For `search`, the output has `output.total_matches` and `output.items[]`. The per-person item fields are **NOT FOUND in docs** pages I read; check `openapi.json`.
```bash
curl -X POST https://api.glasser.ai/v1/solutions/gtm/people_search \
  -H "Authorization: Bearer $GLASSER_API_KEY" -H "idempotency-key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"action":"search","company_domain":"stripe.com","job_titles":["CFO","VP Finance"],"limit":10}'   # (built from schema)
```

### Response envelope (both solutions)
- Run fields: `id`, `status` (`QUEUED|RUNNING|COMPLETED|FAILED|STOPPED`), `result_status` (`success|no_result|error|pending`), `output` (normalized data), `provider_response.http_status`/`.error`, `charge_usd`, `runs[]`, `result_url`.
- An HTTP **202** means the run is still in progress. Poll `GET https://api.glasser.ai` + `result_url` (or `GET /v1/runs/{id}`).
- **Gotcha:** a run can return 200 with `status:"COMPLETED"` while the provider rejected the request. In that case `output` is null, so always check `provider_response`. https://glasser.ai/docs/api-reference/overview.md
- Errors come as `{error:{code,message,...}, request_id}`. Codes include 402 `insufficient_balance` and 429 `rate_limited`. https://glasser.ai/docs/api-reference/runs/create.md
- Generic path for any provider endpoint: `POST /v1/endpoints/search` (`use_case` required) → inspect → `POST /v1/runs` with `{provider, endpoint, input}`. https://glasser.ai/docs/api-reference/endpoints/search.md, https://glasser.ai/docs/api-reference/runs/create.md
- npm SDK: **NOT FOUND in docs**. There is a CLI and an MCP server (`https://api.glasser.ai/mcp`).

---

## 5. Runware (runware.ai): image generation

### Auth and endpoint
- REST: `POST https://api.runware.ai/v1`. Auth is the `Authorization: Bearer <API_KEY>` header, plus `Content-Type: application/json`. Alternatively, put `{"taskType":"authentication","apiKey":"..."}` as the first array element. https://runware.ai/docs/models-api/authentication
- WebSocket: `wss://ws-api.runware.ai/v1`. The first message must be the authentication task. Same source.
- **The body is always a JSON array of tasks.** https://runware.ai/docs/models-api/introduction

### Text-to-image request
```bash
curl https://api.runware.ai/v1 \
  -H "Authorization: Bearer $RUNWARE_API_KEY" -H "Content-Type: application/json" \
  -d '[{
    "taskType": "imageInference",
    "taskUUID": "a770f077-f413-47de-9dac-be0b26a35da6",
    "model": "runware:101@1",
    "positivePrompt": "A golden retriever on a park bench, cinematic lighting",
    "width": 1024,
    "height": 1024
  }]'
```
- `taskUUID` is "A UUID v4 you generate". https://runware.ai/docs/models-api/introduction
- The intro example uses model `xai:grok-imagine@image-2.0`. The SDK example uses `runware:101@1` (https://runware.ai/docs/tools/typescript).
- A single global list of required fields is **NOT FOUND in docs**. Requirements are per model; see each model page under https://runware.ai/docs/models.
- Width and height must be multiples of 8 to 64 depending on architecture. The docs say "Use multiples of 64 for safe values" (e.g. SDXL is 128–2048 in multiples of 8). https://runware.ai/docs/learn/dimensions.md
- Output URLs are kept for 7 days by default (change with `ttl`). `includeCost: true` adds a `cost` field. https://runware.ai/docs/models-api/introduction

### Response
```json
{ "data": [ { "taskType": "imageInference", "taskUUID": "...", "imageUUID": "77da2d99-...",
              "imageURL": "https://im.runware.ai/image/os/.../77da2d99-....jpg", "cost": 0.06 } ],
  "errors": [] }
```
- The image URL is in **`data[].imageURL`**. Failed tasks go to the `errors[]` array (`code`, `message`, `taskUUID`).
- A sync request waits up to 120 s. Past that, the task continues async, and you poll with `{"taskType":"getResponse","taskUUID":"..."}`. Setting `"deliveryMethod":"async"` queues the task up front.
- Sources: https://runware.ai/docs/models-api/introduction and https://runware.ai/docs/models-api/task-polling

### npm SDK
`npm install @runware/sdk`. https://runware.ai/docs/tools/typescript
```ts
import { createClient } from "@runware/sdk";
const client = await createClient({ apiKey: process.env.RUNWARE_API_KEY!, transport: "rest" }); // SDK does not read env itself; default transport is websocket
const images = await client.run({
  taskType: "imageInference", model: "runware:101@1",
  positivePrompt: "A coastal town at dusk", width: 1024, height: 1024, deliveryMethod: "sync",
});
console.log(images[0].imageURL);
```
The older npm package `@runware/sdk-js` exists (https://www.npmjs.com/package/@runware/sdk-js), but the current docs reference only `@runware/sdk`.
