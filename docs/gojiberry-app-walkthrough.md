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
