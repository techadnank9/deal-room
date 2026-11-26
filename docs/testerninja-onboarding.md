# TesterNinja: first design partner

Live app: https://deelroomlive.onrender.com/login
Login: `adnan@testerninja.com`. The password is in `deal-room/.env.local` (`TESTERNINJA_APP_PASSWORD`). Change it after you log in.
Plan: Growth (2,000 contacts/month, 3 mailboxes), given free as our first design partner.

## What is already set up

- **Business**: read from testerninja.com and corrected by hand (Free / $29 unlock / Pro $19.99 / Enterprise).
- **ICP**: founders and small teams shipping web apps weekly with AI coding tools. Agencies and many-app companies are the Enterprise buyers.
- **Personas** (researched, confirmed):
  1. Vibe-coding founder (1-10 people, Lovable/Bolt/Replit/v0/Cursor). Ask: a free run.
  2. Technical co-founder / CTO (5-50 people, ships weekly with AI agents, no QA hire). Ask: a preview link to run on.
  3. App agency / studio owner. Only matches companies that are agencies or studios.
  4. QA / Engineering leader (Enterprise, 100-2,000 people). Ask: a 20-minute pilot call.
- **Signals** (rotating, 3 searches a day in business hours):
  - New launches: Product Hunt, Show HN, Launch YC, apps built with AI builders
  - Hiring surges from company job boards
  - SEC Form D funding and funding news
  - Buying signals on the web
- **Targeting**:
  - Agencies are allowed, because they are buyers.
  - Freelancers and consultancies are excluded.
  - QA vendors and testing agencies are excluded as competitors.
  - The company must have a live web app.
- **Writer**: uses only the facts in "What the writer knows about you". It never claims customers or numbers.
- **Schedule**: weekdays, 9:00 America/Los_Angeles, 15 new leads a day.
- **Mode**: Review. Nothing is sent until you approve it.

## What you need to do (about 5 minutes)

1. **Connect your Zoho mailbox** (needs an app password, which only you can create):
   1. In Zoho Mail, go to Settings → Mail Accounts → `adnan@testerninja.com` → IMAP Access and turn it **on**.
   2. Go to https://accounts.zoho.com → Security → App Passwords, generate one, and name it "Deal Room".
   3. In Deal Room, go to Settings → Connect mailbox:
      - Provider: **Zoho Mail (your company domain)**
      - Email: `adnan@testerninja.com`
      - From name: e.g. "Adnan from TesterNinja"
      - Password: the app password
      - Daily cap: 30
   4. Press "Connect and test". The app tests both sending and reading the inbox, and only saves the mailbox if both work.
2. **Review**: open Agent → Review. Edit anything you like, then Approve or Reject (pick a reason). You can select several leads and approve them together.
3. That's it. Approved emails get a send time inside the next sending window (weekdays from 9:00 Pacific). New mailboxes start at 10 emails a day and ramp up to the cap over 2 weeks. The follow-up goes out 4 days later in the same thread, but only if nobody replied. Replies land in Inbox with a drafted answer.

## Good to know

- The LinkedIn step is a note for you to send by hand. It is never sent automatically.
- Every email has an unsubscribe link. Unsubscribes and bounces go on the do-not-contact list automatically.
- To switch to autopilot later, go to Settings → Schedule & limits → Autopilot.
- Mailbox passwords are encrypted with a key derived from the live database secret. Connect the mailbox on the live site, not on a local dev server.
