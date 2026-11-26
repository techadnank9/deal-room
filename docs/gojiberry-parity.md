# Gojiberry feature parity checklist

Source: Gojiberry public help center, all 112 articles in the 9 collections (tutorial course, getting started,
connecting LinkedIn, finding leads, campaigns, troubleshooting, billing, technical/API, privacy). Read on 2026-11-25.
The 10 "Full tutorial course" lessons (#1-#10) are Loom videos with no text; their topics are covered by the other articles.

Purpose: learn which features and workflows exist. We build our own design and our own words. Nothing here is
copy to reuse; layouts are described only so we know where a feature lives.

Deal Room status checked against code (read only): `components/app/Shell.tsx`, `app/app/agent/page.tsx`,
`app/app/setup/page.tsx`, `app/app/settings/page.tsx`, `app/app/contacts/page.tsx`, `app/app/inbox/page.tsx`,
`app/app/insights/page.tsx`, `lib/agent/*`, `lib/gtm/*`, `lib/mail/*`, `lib/signals/*`, `lib/workspace.ts`,
`lib/mcp/tools.ts`, `app/api/*`.

---

## 1. Gojiberry screen map

### Left sidebar
- **Dashboard** - system check: new leads, agent status, "Next launch" shortcut (paid launch-now).
- **Agents** (also called Outreach Agents) - table of agent cards; per card a ⋮ menu (Duplicate, delete), status
  (e.g. "Leads sourcing only" vs outreach live), red dot when the assistant posted something. "Create an agent" top right.
- **Search** (Beta) - AI/filters lead search over their own people+company directory, with web research mode.
- **Ask** - workspace-wide AI chat (contacts, lists, campaigns). Shares one daily AI limit with the per-agent assistant.
- **Copilot** - two views across all agents: *Autopilot* (every action scheduled in the next 10 h, editable messages)
  and *Review* (approve/reject leads when review mode is on). Newer docs move per-agent review into the agent's Review tab.
- **Contacts** - all leads from all agents; top tabs *All contacts* / *Lists*. Filters (response status, agent, list,
  industry, location, title, signal, campaign status), column picker, bulk select -> Add to list, Move, Remove, Delete,
  Reject, Enrich Email / Enrich Phone, Export to (integration / CSV selection / CSV all). Lists have "Deep research this list".
- **Inbox** (Unibox) - LinkedIn + email conversations; views Conversations / Unread / Interested; account selector top right.
- **Insights** - leads per day, active signals and the leads they produced, top signals per agent.
- **Team activity** (owner) - dashboard per member, 7 days / month ranges, export CSV / per member / PDF report.
- **Integrations** - cards by category (CRM, outreach tools, enrichment, notifications, automation, webhook).
- **Settings** (left menu) -> Account settings with top tabs (below).
- Bottom-left: **Team credits** card (shared balance, next refill date, warning at <= 50), account switcher to log into
  member accounts, Help center, "Talk to an Expert" widget, support chat bubble bottom right.

### Agent page
Header: agent name, status pill, sender chips with daily pace (LinkedIn invites/day, messages/day, mailbox emails/day;
clicking a chip opens that sender's Settings & Limits), **Ask Goji** button (opens resizable right pane), **Start/Pause Outreach**.
Tabs:
- **Overview** - outreach stats, pipeline value, recent activity, upcoming actions.
- **Review** - only when review mode on: queue of leads, open one -> Approve / Reject (+ reason), auto-advance, bulk select bar.
- **Leads** (count) - search, sub-tabs All / Scheduled / In sequence / Replied, Add filters, Export to…, Enrich;
  columns Contact, Company, Signal (+N signals), AI Score (1-3 flames), Email, Phone, Outreach step, plus one column per
  advanced-qualification rule. Row menu: Reject, Permanently delete. Click -> lead drawer (profile, campaign sequence
  with per-step "View message", activity log, qualification research log).
- **Sources** - "Who this agent targets": ICP card (+ Edit targeting, Advanced targeting accordion), Advanced
  qualification; lead source cards (each signal with next scheduled run + Launch now), "+ Lead sources" menu
  (Automatic: High-intent signals, Warm lookalike; Live signals: Website visitors; Manual: CSV, Add a list, Import from LinkedIn).
- **Campaign** - vertical step list with "X day(s) after" labels between steps, Edit per step, top-right Edit
  (structure: add/remove/drag reorder) and Campaign settings (language, goal, tone, 1st-degree rule, email fallback, split messages).
- **Activity** - log of launches; filter "Lead discovery" shows per signal "N of M matched"; website-visitor company rows.
- **Settings** - LinkedIn sender (connect/swap, proxy country), email sender(s), weekly limits, launch hour/days, review mode,
  AI draft reply.

### Agent creation wizard (current)
1) name + source type (High-intent signals vs Existing leads) -> 2) signals/keywords/competitors -> 3) ICP + exclusions ->
4) outreach: channel (Multi-channel LinkedIn+email / LinkedIn only / Email only), Create with AI vs Manual setup ->
5) review limits, preview 5 sample leads, Launch. First-run onboarding starts with "website URL -> Analyze" (features,
social proof, language), then goal + tone.

### Account settings tabs
Account (preferred language) · Workspace / Company knowledge (name, site, industry, size, description, pain points, key
features, social proof; Company Preferences: auto-enrich email, auto-enrich phone) · Senders Accounts (LinkedIn accounts
with limits/schedule/proxy, "Sent this week"; Mailboxes incl. Purchased Mailboxes by domain) · AI Outreach Templates ·
Organization Blocklist (AI Filtering toggle + review; manual Companies / People, CSV import/download) · Members ·
Billing · API · Inbox & AI replies · Chrome extension.

---

## 2. Feature table

Status: **Have** / **Partial** / **Missing**. Effort: S (<= 2 days), M (<= 1-2 weeks), L (more).
"Paid/setup" = needs a paid third-party API or user-side setup.

### Agents, ICP, scoring

| Feature | How Gojiberry does it | Deal Room | What to build | Effort | Paid/setup |
|---|---|---|---|---|---|
| Onboarding from website | Paste URL -> AI extracts features, social proof, language; then goal + tone | Have | Add goal/tone + language step to setup | S | No |
| Agent creation wizard | Name, source type, signals, ICP, exclusions, channel, AI vs manual sequence, preview 5 leads, launch | Partial (one-time setup only) | "New agent" wizard reusing setup steps + 5-lead preview | M | No |
| Multiple agents | 2 included, +$59/mo each; 1 AI source per agent; agents sharing a sender share its limits; Duplicate agent | Missing (1 per workspace; plan field `agents` unused) | Agent table, agent_id on leads/sequences, duplicate | L | No |
| Job roles | Title list, AI matches equivalents (CTO = Chief Technology Officer) | Have (personas) | Show editable title chips with synonym expansion | S | No |
| Industries | Multi-select, advise >= 3 | Have | Editable chips | S | No |
| Company type | Private / Public / Startup | Missing | Add field to IcpSpec + filter | S | No |
| Company size | Brackets 1-10 ... 10,000+ | Have (headcount string) | Use fixed brackets, multi-select | S | No |
| Locations | Countries/continents (search: up to 6 incl. cities) | Have (regions) | Location chips | S | No |
| Excluded toggles | Quick toggles: service providers, freelancers, consultants (+ Open to Work) | Missing | 3-4 toggles checked by LLM persona match | S | No |
| Keywords to exclude | Drops lead if profile, job or company description contains term | Partial (`negativeSignals`, LLM-only) | Hard text filter on company/person text | S | No |
| Mandatory keywords | OR list; at least one must appear exactly in About / job / company description | Missing | Hard include filter + warning on volume | S | No |
| Precision modes | High Precision / Broader / Skip ICP filtering & scoring | Missing | Score threshold setting with 3 presets | S | No |
| Additional criteria | Free-text instructions to bias scoring ("prioritize B2B SaaS, avoid agencies") | Missing | Free-text field fed to scorer prompt | S | No |
| Advanced qualification | Plain-language rules per agent, AI researches company web; per-rule Met / Not met / Couldn't confirm column, research log with source links, manual override, "only keep leads that match all"; free | Missing | Rule list + web-research check per company, column + drawer | M | LLM + web search cost |
| Lead scoring | 1-3 flames from ICP + signal fit; contact score also orders shared-quota priority | Have (0-100 -> flames, tier A/B/C) | Use score to order sending queue | S | No |
| Find more matching leads | Toggle: backfill with close ICP matches when signals are thin | Missing | Toggle to add Glasser people-search fill | S | Glasser credits |
| Feedback learning | Good/poor-fit marks; reject does not auto-train yet | Partial (reject reasons stored) | Feed reject reasons into scorer prompt | S | No |
| Lead preview before launch | 5 sample leads | Missing | Dry-run search, show 5 | S | No |
| Launch now | Run a source immediately, 10 credits; scheduled runs free; results in up to 30 min | Have (run_now, free) | Keep; meter if needed | - | No |
| Per-source schedule | Each signal shows next run; agent launches 3-4x/day, one signal per launch | Partial (3 searches/day) | Show next run per signal | S | No |

### Signals and lead sources

| Feature | How Gojiberry does it | Deal Room | What to build | Effort | Paid/setup |
|---|---|---|---|---|---|
| Signal cap | Up to 15 signals per source agent, mixed types | Partial | Signal list model with per-signal on/off | S | No |
| Competitor engagement | People liking/commenting/following competitor LinkedIn pages | Missing | Needs LinkedIn data | L | LinkedIn scraper API (risk) |
| Topic engagement | People engaging with posts containing keywords | Missing | Needs LinkedIn post data | L | LinkedIn scraper API (risk) |
| Industry experts | People engaging with named influencers' posts | Missing | Same as above | L | LinkedIn scraper API (risk) |
| People engaging with you | Your profile/company page engagers + profile visitors | Missing | Same, needs user LinkedIn session | L | LinkedIn session (risk) |
| Top 5% active profiles | Most active ICP people (posted/reacted in 90 days) | Missing | Needs activity data | M | Data provider |
| Job changes | Started role < 90 days; "new decision-maker in role" | Partial (`exec_hire` via news) | Job-change feed from people data | M | Data provider |
| Funding | Raised in last 12 months, badge with month | Have (SEC Form D + news) | Add month badge, 12-month window | S | No |
| Open roles / hiring surge | Active postings, count; surge flag | Have (ATS counts) | Add surge (delta over time) | S | No |
| Tech stack | From job-post mentions + website detection (chat widgets, analytics, CMS, payments); "high probability", verified when seen on site | Missing | Website script fingerprinting + ATS text match | M | No (own crawler) |
| Website visitors | Tracking script, company reverse-IP, up to 20 ICP people added, 4 credits/new company, returning free, monthly cap, up to 5 domains, consent line, AI/dev/manual install | Missing | Script + reverse-IP vendor + people search per company | L | Reverse-IP API, user installs script, consent |
| Lookalike | Paste reference profile or domain; role + firmographic + techno match; own agent | Missing | Domain -> similar companies via LLM + search | M | Search API |
| News / web buying signals | Web research mode in Search with sourced "why" badge | Have (web search + Google News, cited) | Show source link badge per lead | S | No |
| CSV import | First/Last/LinkedIn URL required (email-only ok if email mapped); column mapping; custom fields usable as variables; 10 MB / 10,000 rows; not ICP-scored | Missing | Upload + mapper + custom fields | M | No |
| Saved list as source | Use an existing list not used by another agent | Missing | Lists model, attach to agent | M | No |
| LinkedIn import | Search URL, Sales Nav search/list, post likers/commenters (1 credit/30), company followers (1 credit/5), profile visitors, 1st network, single profile | Missing | Defer; single-profile URL import only | L | LinkedIn scraper (risk) |
| Chrome extension | On LinkedIn profile: signal preview, import, find email/phone; on company site: details, best-fit agent, angle, employees, tech, about | Missing | Later: extension for company sites first | L | Chrome store |
| AI Search page | Natural language -> filters (company, size, industry, keywords, title, connections, location <= 6, signals); 25/50/100 rows; blurred last names until added; 0.5 credit/lead, +1 email, +10 phone; add to agent/list/CSV; web research mode + "find more" | Missing | Search page over Glasser + our signals, add to list/agent | L | Glasser credits |
| Deep research a list | Research saved list against company criteria | Missing | Reuse advanced qualification on a list | S (after AQ) | LLM cost |

### Review, contacts, enrichment

| Feature | How Gojiberry does it | Deal Room | What to build | Effort | Paid/setup |
|---|---|---|---|---|---|
| Review mode | Per-campaign checkbox; leads wait in Review tab; approve sends at next launch | Have (review vs autopilot, message-level) | Keep | - | No |
| Reject reasons | Wrong industry/type, size/location, title/seniority, duplicate/known, incorrect info, irrelevant signal | Have (6 similar reasons) | - | - | No |
| Bulk approve/reject | Checkboxes, select all, selection bar with count, Clear selection; auto-advance on single | Missing (one lead at a time) | Bulk bar in Review and Leads | S | No |
| Reject vs delete | Reject = never contacted; delete = removed, never re-imported | Partial | Add delete + no-reimport rule | S | No |
| Leads sub-views | All / Scheduled / In sequence / Replied + filters | Partial (status tabs) | Add Scheduled view (next send) | S | No |
| Contacts filters/columns | Many filters, column picker, bulk actions, lists | Partial (status filter + CSV export) | Filters + column picker + bulk | M | No |
| Lists | Named lists; one contact per list; list linked to campaign enrolls contacts; move "Not contacted" only | Missing | Lists table + add/move | M | No |
| Export | CSV selection / all, to integration, from agent Leads tab | Partial (CSV of filtered contacts) | Export selection + per agent | S | No |
| Contact notes / activity log | Notes, per-contact activity log, campaign sequence view | Partial (stage history) | Lead drawer with timeline + notes | S | No |
| Email enrichment | Waterfall over 15+ providers (FullEnrich, AirScale, Findymail), 2 verifiers (BounceBan); auto at email step; 1 credit/found, refunded if not found | Have (Glasser find+verify) | Add 2nd provider fallback | M | Second provider API |
| Phone enrichment | 10 credits per number; auto-enrich phone option | Missing | Phone lookup via provider | S | Provider API |
| Auto-enrich toggles | Workspace: auto-enrich emails / phones for new leads only | Partial (always on for email) | Toggle + phone option | S | No |
| Blocklist | Org-wide; companies by domain (+name), people by LinkedIn URL; manual or CSV; download | Partial (do-not-contact list, emails) | Domain + person blocklist UI with CSV | S | No |
| AI competitor filtering | Toggle; AI blocks competitors/substitutes; review panel with "Not a competitor"; 50 credits/user/month | Missing | LLM competitor check vs our offer, review list | S | LLM cost |

### Campaigns and messaging

| Feature | How Gojiberry does it | Deal Room | What to build | Effort | Paid/setup |
|---|---|---|---|---|---|
| Sequence builder | Steps: connection request, message, voice message, visit profile, like posts, send email; add/remove/drag reorder before contacts progress | Missing (fixed 3 steps: email d0, LinkedIn note manual d1, email d4) | Editable email-step builder (add/remove/reorder) | M | No |
| Delays | "X day(s) after" on each step, min 1 day, belongs to next step | Partial (fixed) | Editable delays | S | No |
| Message modes | AI icebreaker / AI template / same message for everyone (variables FirstName, LastName, Company; GIF/attachment) | Partial (AI only, editable in review) | Per-step mode selector | M | No |
| AI templates | Settings tab; channel (email/LinkedIn), slot (icebreaker / follow-up / closing); copy + AI prompt; "Need inspiration" presets; generate preview on a contact; must be assigned to a step | Missing | Template library + prompt + preview | M | No |
| Variables | [FirstName] [Company] [Role] [intent] [CTA] [SenderFullName] [SenderCompany] [Company Context] + CSV custom fields | Partial (LLM fills) | Variable picker incl. custom fields | S | No |
| Company knowledge | Workspace: description, pain points, key features, social proof (main AI input) | Partial (learned from website) | Editable knowledge fields | S | No |
| Campaign settings | Language (account default + override), goal (start conversations / book calls), tone (Professional / Conversational / Direct); changes only affect new messages | Missing | Settings panel; regenerate pending drafts | S | No |
| Preview per lead | Generate preview for a sample lead; open contact -> view/edit message per step | Have (review shows drafts) | Preview-as-lead in campaign tab | S | No |
| Copilot / upcoming actions | Next 10 h of actions across agents, edit before send, regenerate | Missing | "Up next" queue from outbox | S | No |
| Stop on reply | Lead exits all automated steps on reply | Have | - | - | No |
| Email fallback | "Skip after X days" on connection request -> next email step | Missing (no LinkedIn) | Only relevant with LinkedIn | - | - |
| Split messages | LinkedIn message split into 2-4 parts | Missing | LinkedIn only, skip | - | - |
| AI voice messages | Recorded once or AI per lead; ElevenLabs voice clone (2 min recording, consent, up to 3 voices, 6 languages), 12 built-in voices; 2 credits each; LinkedIn 1st-degree only | Missing | Skip until LinkedIn; could attach audio link in email | L | ElevenLabs |
| Edit live campaign rules | Pause before structural changes; duplicate agent for big changes; move only Not-contacted leads | Missing | Pause + duplicate | S (after multi-agent) | No |
| Email-only agent | Email only channel, unlimited mailboxes, random rotation, skip if no email (no charge) | Have (email-first) | Mailbox rotation | S | No |

### LinkedIn (last, risky)

| Feature | How Gojiberry does it | Deal Room | What to build | Effort | Paid/setup |
|---|---|---|---|---|---|
| LinkedIn connection | Credentials login, "Infinite login" (authenticator secret), connection email flow, cookie via Chrome extension; status Connected with name+photo | Missing (by design) | Defer; keep manual copy of notes | L | Unipile-type API, ToS risk |
| Proxy | Residential proxy matched to chosen country, or custom proxy | Missing | Needed only with LinkedIn | M | Proxy vendor |
| Weekly quotas | Weekly invites / messages / visits, recommended by account maturity; ~100 invites/week standard, 100-180 strong Sales Nav; shared across agents; "Sent this week" | Missing | With LinkedIn | M | - |
| Safety rules | Randomized spacing, global throttling, warn at < 20% acceptance and > 500 pending, withdraw invites > 3-4 weeks | Missing | With LinkedIn | M | - |
| Invitation note | Up to 180 chars; non-Sales-Nav limited to 5 notes/month; "like 1-2 posts before sending" | Partial (we draft a note to send by hand) | Keep manual | - | - |
| 1st-degree campaigns | Remove invite step; toggle "exclude 1st-degree connections" | Missing | With LinkedIn | S | - |

### Senders, schedule, deliverability

| Feature | How Gojiberry does it | Deal Room | What to build | Effort | Paid/setup |
|---|---|---|---|---|---|
| Mailbox connect | Google OAuth, Microsoft OAuth, IMAP/SMTP (IMAP 993/143, SMTP 465/587/2525, no 25; tests both before saving; app password) | Partial (IMAP/SMTP + presets only) | Add Google + Microsoft OAuth | M | Google/MS app verification |
| Ramp-up | Start 2/day, +2 each sending day, cap 30 (~15 sending days); can disable and set 1-500/day; warn if mailbox < 4 weeks | Have (10 -> cap over 14 days) | Show "Day N of 15" + manual override | S | No |
| Smart warm-up | Pool of customer mailboxes exchanging AI emails 8:00-18:00, opens/replies/spam rescue, archived to folder, not counted in limit, free; own domain only; stats: inbox/promotions/spam/not delivered; auto-pause if > 25% spam | Missing | Warm-up pool across our customers | L | Needs user base; or warm-up vendor API |
| Deliverability check | SPF, DKIM (std selectors), DMARC (suggest p=quarantine), MX, website, tracking domain; badges All set / N to fix; "copy instructions for admin" | Missing | DNS check panel per mailbox | S | No |
| Sender name + signature | Per mailbox, signature up to 2,000 chars | Partial | Signature field | S | No |
| Open tracking + unsubscribe | Both on by default, per mailbox toggles; tracking domain | Partial (unsubscribe yes, no open tracking) | Open pixel toggle | S | Tracking domain |
| Done-for-you mailboxes | Buy domain ($15 once) + Google Workspace inboxes ($9/mo each, up to 3/domain), SPF/DKIM/DMARC, warm-up, redirect to site, ready in ~1 h (up to 48 h) | Missing | Resell via domain + mailbox vendor | L | Registrar + mailbox reseller, payments |
| Multiple mailboxes per campaign | 1 sender for LinkedIn+email; unlimited + rotation in email-only | Partial (plan caps 1/3 mailboxes) | Rotation across mailboxes | S | No |
| Launch schedule | Launch hour (user's time zone) + active days (default Mon-Fri); runs twice a day, most actions at window start; outreach 1 hour after accept | Have (sending window, random slots) | Active-days picker | S | No |
| Same-thread follow-ups | "Re:" + subject, copy saved to Sent | Have | - | - | No |

### Inbox, assistant, notifications

| Feature | How Gojiberry does it | Deal Room | What to build | Effort | Paid/setup |
|---|---|---|---|---|---|
| Unified inbox | LinkedIn + email; Conversations / Unread / Interested (AI on first message); per-account selector; reply, read/unread, archive, delete; "only Gojiberry contacts" setting | Have for email (Interested, Needs reply, Not now, Unsubscribed/Bounced; send) | Unread state, archive, account selector | S | No |
| AI draft reply | Draft for every inbound, never auto-sent; calendar link; instructions up to 500 chars | Partial (draft yes) | Calendar link + instructions fields | S | No |
| Ask Goji (per campaign) | Right pane; reads sequence, sources, leads, replies, other 30 campaigns; shows tool steps; bar charts for >= 3 figures; one "suggestion" tile; follow-up chips; thumbs; "since last visit" box; changes only via Apply cards (sequence, source, start/pause, reply, send to integration, LinkedIn import, bulk confirm); outdated cards disabled; scheduled tasks (reports by email/Slack); weekly advice after 1 week; free; daily AI limit resets 02:00 UTC | Partial (Moss memory + voice team room, not campaign-scoped actions) | Campaign assistant pane with apply-cards | L | LLM cost |
| Workspace Ask page | Chat over contacts/lists/campaigns; reports, ICP advice, write messages, edit sequences, exclude contacts, add notes; 75k tokens/day, reset for 50 credits | Partial (team room) | Reuse assistant at workspace scope | M | LLM cost |
| Slack | Reply alerts, export to Slack, Ask Goji in Slack DMs/channels with buttons (no sequence edits), email match for identity | Missing | Slack app: reply alerts first, then assistant | M | Slack app setup |
| Insights | Leads/day, signals -> leads, top signals per agent | Have (funnel, replies by signal, persona, A/B) | Add leads/day chart | S | No |

### Integrations, API

| Feature | How Gojiberry does it | Deal Room | What to build | Effort | Paid/setup |
|---|---|---|---|---|---|
| HubSpot | OAuth (or service key with contacts/companies rw, owners, schema, optional deals/lists); owner, field mapping, create on All leads / First reply / Manually; skip existing; deal-stage exclusion; import lists; logs; only new leads auto | Missing | HubSpot OAuth push on first reply + mapping | M | HubSpot app |
| Salesforce | External client app, client id/secret/domain, OAuth | Missing | Later | M | SF app |
| Pipedrive, Instantly, Lemlist, Clay, Zapier | Listed integrations / export targets | Missing | Pipedrive + Zapier via webhook first | M | Vendor apps |
| Webhooks | URL on Integrations; POST full contact JSON on create/update; header with user id; manual trigger from Contacts | Missing | Webhook URL + events + HMAC signature | S | No |
| REST API | Settings -> API key; contacts (list/get/create/update/delete, no re-import), campaigns (list/get); rate limit 429; reveal/search endpoints | Missing | API keys + contacts/leads endpoints | M | No |
| MCP server | Hosted HTTP MCP with Bearer API key; contacts, lists (add = enroll), campaigns read, agents ICP read/update, unibox read | Partial (`/api/mcp` with team/pipeline tools, company-scoped) | Add API-key auth + contacts/lists/ICP tools | S | No |

### Billing, team, compliance

| Feature | How Gojiberry does it | Deal Room | What to build | Effort | Paid/setup |
|---|---|---|---|---|---|
| Plan | Single plan $99/mo: 2 agents, 2 LinkedIn seats, AI messages, enrichment, 200 credits/mo; 7-day trial with card; quarterly -10%, annual -20% | Partial (trial/Starter $79/Growth $199 by contacts; Stripe checkout) | Billing period discounts; trial-with-card decision | S | Stripe |
| Add-ons | Agent $59/mo (~900 contacted/mo), member $99/mo, prorated, remove only unassigned | Missing | Stripe add-on items | M | Stripe |
| Credits | Shared wallet; monthly refill per seat, rollover; packs 500-20,000, never expire; auto top-up (threshold + pack); refund on miss; usage history; sidebar balance, warning <= 50; per-member usage | Partial (Flexprice metering) | Credit ledger + packs + auto top-up | M | Stripe + Flexprice |
| Billing tab | Plan, status, period, next date, payment method, cancel (with reason), invoices + invoice email, credit usage table | Partial (plan usage meter) | Stripe customer portal link + usage list | S | Stripe |
| Trial end / failed payment | Workspace paused, data kept; campaigns stop until paid | Unknown/Partial | Pause agent on lapse, keep data | S | No |
| Team members | Owner / Admin / Member roles; invite by email or link; paid members get own account+agents; up to 3 free guests (view only); owner/admin "log in as" member; team activity dashboard + CSV/PDF export | Missing | Members + roles + invite; shared workspace first | L | No |
| GDPR / privacy | Processor vs controller, DPA on request, legitimate interest basis, opt-out page, opt-out deleted in 30 days + suppression list, account purge in 90 days, logs 1 week-1 month, subprocessor list, AI provider disclosure, EU hosting | Partial (unsubscribe + do-not-contact) | Public opt-out request page, suppression on delete, subprocessors + DPA pages | S | Legal review |
| Support | Chat, weekly webinar, 1 expert call/month (paid only), onboarding call for 3+ seats | Missing | Out of scope for product | - | - |

---

## 3. Build order (top 15, fastest path to parity, LinkedIn last)

1. **ICP controls**: company type, excluded toggles, keywords to exclude, mandatory keywords, precision mode, additional
   criteria, 5-lead preview. Cheap, uses existing scorer, closes the most visible gap. (S-M)
2. **Bulk review + Leads views**: select all / bulk approve-reject bar, Scheduled view, reject vs delete with no re-import. (S)
3. **Editable email sequence**: add/remove/reorder email steps, per-step delay, mode (AI / template / fixed with variables),
   campaign settings (language, goal, tone). (M)
4. **AI templates + company knowledge**: template library with prompt, preview on a real lead; editable pain points,
   features, social proof. (M)
5. **CSV import + Lists**: column mapping, custom fields as variables, 10k rows; lists as an agent source; move only
   not-contacted. (M)
6. **Blocklist + AI competitor filter**: domain/person blocklist with CSV; LLM check that drops competitors with a review list. (S)
7. **Deliverability panel**: SPF/DKIM/DMARC/MX/website checks per mailbox, signature, open-tracking toggle, ramp-up "day N",
   manual limit override, active days. (S)
8. **Advanced qualification**: plain-language company rules researched on the web, per-rule column with source links,
   override, "only keep all-met". Strong differentiator on top of our cited signals. (M)
9. **Webhooks + API keys + MCP auth**: signed webhooks on lead created / replied / stage change; contacts API; put the
   existing MCP behind API keys with contacts/lists/ICP tools. (S-M)
10. **Slack reply alerts** then **HubSpot OAuth push** (create on first reply, owner + field mapping, skip existing). (M)
11. **Multiple agents per workspace**: agent table, agent_id everywhere, duplicate, pause; respect plan `agents` count. (L)
12. **Credits wallet**: ledger with refunds on miss, packs, auto top-up, usage history, per-member usage; then phone
    enrichment and a second email provider. (M)
13. **Campaign assistant pane**: campaign-scoped chat with tool steps, charts, and apply-cards for sequence, source,
    pause, bulk lead decisions, reply drafts; weekly advice later. (L)
14. **Team members + roles**: owner/admin/member, invite, shared workspace; guests later. Then Google/Microsoft OAuth
    mailboxes and a lookalike source; tech-stack signal from our own site crawler. (L)
15. **Website visitors, AI Search page, warm-up pool, done-for-you mailboxes, LinkedIn** (connection, quotas, proxy,
    voice notes, LinkedIn-based signals, Chrome extension): each needs a paid vendor, user setup, or carries account/ToS
    risk. Do these last, LinkedIn automation at the very end.

### Notes
- Gojiberry's core signals (competitor, topic, expert, engager, profile visitors) all depend on LinkedIn data. Our
  parity there is "Missing" by choice; our web/news/ATS/Form D signals with citations are the substitute and should be
  presented as such.
- Things we already do that Gojiberry documents as weaker: reply classification into 5+ categories with bounce/OOO
  detection (they flag only "Interested"), A/B first-email variants, cited signal sources on every lead.
