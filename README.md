# thc-bot

**An assistant that watches The Hack Collective's WhatsApp groups, spots tech events people share, and — once you approve — adds them to the THC Luma calendar so the whole community can see them in one place.**

THC's WhatsApp groups are full of hackathons, talks, and meetups shared as messages and Luma links. They scroll away and get lost. This bot reads those chats, pulls out the real events, shows them to you in a simple review screen, and (with one click) puts the approved ones on the Luma calendar for everyone to browse.

---

## How it works (in plain English)

Think of it as a diligent assistant that does four things, in order:

1. **Reads the chats.** It quietly keeps a copy of the messages from the WhatsApp groups you choose.
2. **Spots the events.** It looks through those messages and picks out the ones that are actually events — a hackathon, a workshop, a demo night — and ignores the chit-chat, memes, and job posts.
3. **Asks you first.** Every event it finds lands in a review list. Nothing is posted anywhere until a human looks at it and clicks approve. You can reject the ones that don't belong.
4. **Adds them to the calendar.** When you approve an event, the bot opens the THC Luma calendar in the background and adds the event to it — so it shows up alongside everything else the community is following.

It never invents events, and it never posts without your approval.

```
WhatsApp groups  →  finds events  →  you review & approve  →  THC Luma calendar
```

### A closer look at each step

**1. Reading the chats.**
The bot uses a tool called `wacli` that connects to WhatsApp (the same way WhatsApp Web does — you scan a QR code once). It saves recent group messages to a small database on your computer. Your messages stay local; nothing is uploaded anywhere except what you explicitly approve for Luma.

**2. Spotting the events.**
Two things happen here:
- **Shared Luma links** (like `luma.com/some-event`) are the easiest — the bot opens the link and reads the event's real title, date, and location straight from the page. No guessing.
- **Events written as plain text** ("Hackathon this Saturday at 2pm...") are read by an AI model (OpenAI) that pulls out the title, date, and place. If it isn't confident something is a real event, it drops it.

Each event gets a **confidence score** (e.g. 95%) so you can see how sure the bot is.

**3. Reviewing.**
Everything the bot finds shows up in a local web dashboard (a private control panel that runs on your own machine). You see each event as a card with its details and can:
- **Approve & Publish** — approve it *and* add it to the calendar in one step.
- **Approve only** — keep it, add it to the calendar later.
- **Reject** — throw it out. Rejected events are remembered for 30 days (so the bot doesn't re-suggest them), then cleaned up automatically.

**4. Adding to the calendar.**
When you publish, the bot opens the Luma calendar's "Add Event → add an existing Luma event" screen, pastes the event's link, and saves it. A live console shows exactly what it's doing, so if anything goes wrong you can see the error and click **Publish** again to retry.

> **Why a browser instead of a direct connection?** Luma's automatic connection (its API) is a paid feature. To avoid that cost, the bot simply drives a real browser the same way a person would — clicking and typing on the Luma page.

---

## The dashboard

A private web control panel that runs on your computer at `http://localhost:4600`. It only works locally — it reads the event queue and drives your own browser, so it isn't a public website.

Sections:

- **Review** — the main screen. Pending events waiting for your decision. A **Pull new events** button triggers a fresh scan on demand.
- **All events** — every event the bot has ever seen, filterable by status (pending / approved / published / rejected).
- **WhatsApp** — choose which groups the bot watches, see connection status, and backfill older history.
- **Luma** — which calendar events go to, and a **dry-run** switch (fill everything in but don't actually save — useful for testing).
- **Settings** — which AI model to use, the confidence cut-off, and how far back to look on the first scan.

Two things are always visible:

- **A live console in the top-right corner** — whenever the bot pulls new events or publishes one, its progress streams here on any page, so you can watch it work and spot errors.
- **Status pills in the sidebar** — "WhatsApp connected" and "Auto-scan on", so you know the bot is alive.

### Automatic scanning

You don't have to click "Pull new events" every time. When the dashboard is open, the bot **automatically checks the WhatsApp groups on a schedule** (every 10 minutes by default) and adds anything new to the review list. The "Auto-scan on" pill in the sidebar confirms it's running.

---

## Setup

**What you need first:**
- **Node.js** version 20 or newer (the runtime the bot is built on).
- **wacli** — the WhatsApp bridge: `brew install openclaw/tap/wacli`, then run `wacli auth` and scan the QR code with your phone (WhatsApp → Linked Devices).
- An **OpenAI API key** (for reading plain-text events).
- A **free Luma account** that manages the calendar you want events added to.

**Install:**

```bash
npm install                 # bot
cd dashboard && npm install # dashboard
cp .env.example .env         # then fill in your values (see Config below)
```

**Sign in to Luma once** (so the bot can add events without asking for a password each time):

```bash
npm run login   # opens a browser — sign in, then press ENTER in the terminal
```

---

## Running it

Day-to-day, you'll mostly just open the dashboard and let auto-scan do the work:

```bash
cd dashboard && npm run dev   # dashboard at http://localhost:4600
```

The individual commands, if you want to run the bot from the terminal:

| Command | What it does |
|---------|--------------|
| `npm run run` | Scan WhatsApp once and add new events to the review list. |
| `npm run watch` | Keep scanning automatically on a schedule (this is what auto-scan uses). |
| `npm run review` | Open the review dashboard. |
| `npm run login` | One-time Luma sign-in (saves the session). |
| `npm run publish` | Add all approved events to the Luma calendar. `npm run publish 5` does just event #5. |
| `npm run export -- pending` | Save the events to a spreadsheet/Markdown file as a manual backup. |

---

## Configuration

**Two layers, one rule: secrets + bootstrap live in `.env`; everything tunable lives in the dashboard.**

The dashboard's **Settings / WhatsApp / Luma** screens write to `data/settings.json`, which the bot reads and which **overrides** `.env`. So the `.env` tunables below are only *first-run defaults* — once you set a value in the dashboard, `settings.json` wins and the matching `.env` line becomes dead. The precedence, in `src/config.ts`, is: `data/settings.json` → `.env` → built-in default.

**Tunables (first-run defaults — normally managed from the dashboard):**

| Setting | Managed in UI | Meaning |
|---------|---------------|---------|
| `OPENAI_MODEL` | Settings | AI model for reading plain-text events (default `gpt-4o-mini` — cheap). |
| `LUMA_MODEL` | Luma | AI model used when adding events to Luma. |
| `WA_GROUPS` | WhatsApp | Which WhatsApp groups to watch (blank = all). |
| `INGEST_SINCE_DAYS` | Settings | How far back to look on the first scan. |
| `POLL_INTERVAL_MIN` | — | How often auto-scan checks for new messages (default 10 min). |
| `LUMA_CALENDAR_URL` | Luma | Calendar events get added to — use the calendar's **manage** URL. |
| `LUMA_DRY_RUN` | Luma | `true` = rehearse publishing without saving (safe for testing). |
| `CONFIDENCE_THRESHOLD` | Settings | How sure the bot must be before an event reaches the queue (0–1). |
| `MODERATION_ENABLED` / `MODERATION_MODEL` / `MODERATION_THRESHOLD` | Settings | Scam/spam flagging (beta — see below). |

**Env-only (never in the dashboard — must stay in the env file):**

| Setting | File | Meaning |
|---------|------|---------|
| `OPENAI_API_KEY` | `.env` | OpenAI key. Secret — never written to `settings.json`, never committed. |
| `REVIEW_PORT` | `.env` | CLI review-server port (default 4600). |
| `WACLI_BIN` | `.env` | Path to the `wacli` binary, if not on `PATH` (optional). |
| `SESSION_SECRET` | `dashboard/.env.local` | Signs dashboard login cookies. Long random string. |
| `SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_PASSWORD` | `dashboard/.env.local` | Seeds the first admin (see below). |

## Signing in (dashboard auth)

The dashboard is protected by a username/password login.

- **First run** seeds one **super admin** from `SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_PASSWORD` (`dashboard/.env.local`), *only if the users table is empty*. If you don't set a password, it seeds `admin` / `changeme` and **forces a password change on first login**.
- The **super admin** can add and remove other admins from the **Admins** page. Regular admins can use everything except user management. The super admin can't be deleted.
- Sessions are stateless, HMAC-signed cookies (`SESSION_SECRET`); passwords are scrypt-hashed. No external auth service, no extra dependencies.
- Copy `dashboard/.env.example` to `dashboard/.env.local` and set `SESSION_SECRET` before first use:
  ```
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

### Testing safely

- Point `LUMA_CALENDAR_URL` at **your own** test calendar first, not THC's live one.
- Turn on **dry-run** (`LUMA_DRY_RUN=true`) to rehearse publishing without saving anything.
- Limit which groups are scanned while you experiment.

---

## Privacy & safety

- WhatsApp messages and the review queue stay **on your computer**. Nothing leaves it except the event links you approve for Luma.
- The bot **never publishes without a human clicking approve.**
- Secrets (`.env`), the WhatsApp session, and the saved Luma login are all excluded from version control — never commit them. If a key is ever shared by accident, rotate it.

---

## Under the hood (for developers)

- **Language/runtime:** Node.js + TypeScript (ESM, run via `tsx`).
- **Ingest:** `wacli` → local SQLite.
- **Extract:** Luma links are fetched and parsed directly (JSON-LD/OpenGraph, no AI cost); plain-text events use OpenAI structured outputs with a Zod schema. Low-confidence items dropped; duplicates collapsed by Luma URL or title+date.
- **Queue:** `better-sqlite3` at `data/thc-bot.sqlite`. Rejected leads are stamped and purged after 30 days.
- **Publish:** [Stagehand](https://github.com/browserbase/stagehand) drives a local, persistent-login browser through Luma's "add existing event" flow. Success is confirmed by the dialog closing; failures leave the lead `approved` so it can be retried.
- **Moderation (beta):** every ingested message is scored by cheap regex/unicode heuristics (`src/moderation/heuristics.ts`); only borderline ones cost an LLM call (`src/moderation/classify.ts`). Scam/spam messages are flagged into a review queue — nothing is deleted from WhatsApp. Off by default; enable in Settings.
- **Dashboard:** Next.js (App Router), local-only. Streams the bot's output to a shared top-right console via a React context; auto-starts the `watch` loop on load. Auth is enforced by `dashboard/middleware.ts` (edge, verify-only) with password/session logic in `dashboard/lib/auth.ts` (Node). The login page uses a Three.js backdrop (`components/LoginScene.tsx`).

Key paths: `src/pipeline.ts` (orchestration), `src/extract/` (event extraction), `src/moderation/` (scam/spam flagging), `src/luma/publish.ts` (calendar automation), `dashboard/` (the console), `dashboard/lib/auth.ts` (auth).
