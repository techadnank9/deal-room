# Gojiberry app walkthrough (Nov 26, 2026)

Logged in as a no-trial account (0 credits). Clicked through every page the account could open; nothing was sent,
enriched, bought or deleted. **Agents (/campaigns), Copilot and Integrations redirect to /pricing without a trial**
(card required, "billed immediately"), so those are described from the help center in `gojiberry-parity.md`.

## Sidebar
Dashboard · Copilot · Agents · Search (Beta) · Contacts · Inbox · Insights · Settings (Account settings, Integrations)
· MCP (New) · Chrome extension. Bottom: "Go Premium / Start Trial", Help Center, Roadmap & Ideas, Referral program,
TEAM CREDITS (remaining), user card.

## Pages seen

| Page | What is on it | Deal Room now |
|---|---|---|
| Dashboard `/home` | "Get Started" 4 steps: create AI agent → connect LinkedIn/email → start first campaign → integrate tools (optional), Skip | Dashboard checklist (website → personas → mailbox → launch) |
| Search `/search` | "Who are you looking for?" one box, "Search 800M+ profiles… turn it into filters, signals and research", "Or start with filters", 4 example prompts, "Looking for continuous prospecting? Create an Agent →" | **New** `/app/search`: plain-words box → filters shown as chips → live web search → companies with signal, reason and source → select → "Add to my agent" |
| Contacts `/contacts` | Tabs All contacts / Lists; "Add leads" (pick an agent); Add filters panel (AI Agent, List, AI Score, Email enrichment, Phone enrichment, Replied, Signal, Industry, Location, Company size, Approval, Campaign status, Date range, Sort; Clear all); bulk Add to list / Export to… / Enrich; columns Contact, Company, Signal (+N), AI Score, Email, Phone, Import Date, List, Approval, Actions; 25/50/100/200 per page | **Rebuilt**: same tabs, filter panel (persona, list, AI score, email, status, signal, found by, sort), select + bulk Add to list / Remove from list / Export selected, Added + List columns, paging 25-200. No phone (no provider) |
| Contact `/contacts/:id` | Name, title @ company; Find email, Find phone; N Signals with dates; company card (description, industry); other info (location, profile summary); Internal notes + Save; Activity logs; Export | **New** `/app/contacts/<lead>~<contact>`: signals with sources, why this company + score reason, every email to this person with status, activity, contact card with list picker, company card (industry, people, HQ, funding, others there), notes, Find email, Export |
| Inbox `/unibox3` | Conversations, account selector, tabs Inbox / Interested / Unread / All; LinkedIn inbox activation per account | Email inbox with Interested / Needs reply / Not now / Unsubscribed tabs and drafted replies (unchanged) |
| Insights `/insights` | "All agents · Last 30 days": Leads found, Contacted, Replied (reply rate), Interested (% of replies); Agent performance; Lead source performance | **Added**: 7 / 30 days / all-time range, KPI row with sub-lines (reply rate, % of replies), leads-per-day chart, lead source performance table |
| Settings `/settings` | Company Information (name, website + Generate with AI, industry, size, value proposition 3000, pain points 2000, key features, social proof, LinkedIn page); Company Preferences toggles: auto-enrich emails (1 credit), auto-enrich phones (10 credits), prevent contact / company duplication across members | Company knowledge lives in Agent → Campaign (linked from Settings). **New** Company preferences: find emails automatically; only write to persona matches |
| MCP `/mcp` | "Your sales workflow, inside your AI assistant"; example chat; Connect Claude / ChatGPT / Grok, Codex / Other; "Browsing is free, finding/enriching uses credits" | **New** `/app/mcp`: private per-workspace link (shown once, rotate, turn off), steps for Claude, ChatGPT, Claude Code, Codex, other |

## Security fix that came with the MCP page
`/api/mcp` had no login: anyone with the URL could pass `company: testerninja.com` and read leads or approve
emails (which now really send). Now a company that belongs to a workspace is refused unless the call carries that
workspace's key (`?key=dr_…` or `Authorization: Bearer dr_…`), and a key pins every call to its own company.

## Paywalled screens, from their own tutorials (Nov 26, 2026)
Sources: six YouTube transcripts (mM0L4vgCFsY, mblML4FA794, WrEz2AH7nCg, VumsPU_4n7g, 6TkGHiFueRI, D1fqg4yQ0ZE), G2 (29 reviews), Trustpilot (116).

- **Agent wizard**: website → channel → connect accounts → goal + tone → ICP chips (titles, industries, locations,
  company type, size bands) → exclusions (service providers, freelancers, open-to-work, keywords, competitors) →
  starter signals (top 5% active, job change < 90 d, raised funds, hiring) → keywords → competitors → summary →
  **preview 5 leads, mark fit / not fit** → launch.
- **Agent tabs**: Overview, Leads (signal + flames + drawer with queued messages), Queue (next send countdown),
  Review, Sources (ICP, x/15 signals, add lead source, Smart Lead Finder), Campaign, Activity ("scanned 100, 30
  matched" per signal), Settings (limits, launch hour, days, review mode, language/goal/tone, senders).
- **Campaign**: steps (invite, LinkedIn message, voice, visit, like, email) with delays; per step 3 modes: same text
  for all, AI icebreaker, AI + your template; templates have channel, type (icebreaker / follow-up / closing),
  variables, free-text AI instructions, and a preview on a real lead.
- **Copilot**: Autopilot (actions in the next ~10 h, editable) and Review (approve / reject, "Refine with AI").
- **Integrations**: HubSpot (on reply), Slack reply alerts, Pipedrive, Salesforce, Zoho CRM, Instantly, Lemlist,
  HeyReach, Clay, webhook, Zapier, API, MCP. Mailboxes: Gmail and Outlook only (no Zoho).
- **Users praise**: signal-based leads, review before sending, messages that cite the trigger, easy setup, support.
- **Users complain**: surprise renewals and hard cancellation, leads off-ICP with no reason given, can't run a
  campaign now, no lookalike search, no exclusions per signal, confusing UI at first.

### Built from this (commit 12b8b27)
Fit / not-fit learning (reject reasons are saved and fed to every picker), Refine with AI in Review, Preview 5
leads in Sources, Activity "scanned N, picked M, skipped X because Y", dashboard pipeline value + replies + hot leads.

### Still open
Editable sequence builder and AI templates with preview; Copilot "next 10 hours" editable queue; Slack reply alerts,
HubSpot push, webhook; several agents per workspace. Billing: when Stripe goes live, send a renewal reminder and
make cancel one click (their most common complaint).

## Latest videos (last 2 months, 16 transcripts, Nov 26)
New since the first pass: buy pre-warmed lookalike domains + 1-3 inboxes in-app; per-mailbox warm-up counter, signature,
tracking and unsubscribe toggles (2-3/day start, 30/day max, no links); Slack reply alerts with team cover; MCP/ChatGPT/
Grok/Claude can create agents and campaigns, reveal (0.5 credit) and enrich; Chrome extension (company employees, email/
phone, tech stack, signals); website visitors (company reverse-IP, then ICP people, never mention the visit); stacked
signals rank a lead higher; LinkedIn AI voice notes.

### Built from this (Nov 26)
Editable sequence (steps, days, AI / template / fixed text with variables, per-step instruction, reorder, reset,
rewrite waiting drafts); template library with preview on a real lead; mailbox signature, editable daily limit and
"sent X of Y today"; Slack reply alerts; signed outgoing webhook (lead.found, email.sent, reply.received); edit or
cancel queued emails; stacked-signal ordering in Review; Search lookalikes + CSV export.

### Still not built
In-app domain/inbox purchase, Chrome extension, website visitors, several agents per workspace, team members,
credit packs, LinkedIn automation (by choice).
