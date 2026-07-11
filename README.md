# Lore

Everybody knows documentation goes stale. You find a doc that's supposed to answer your question, and it was last updated three years ago. But the update *did* happen — it happened in a Slack thread. Someone asked the same question six months ago, got the real answer, and it's been sitting there ever since. 

Lore fixes that. Ask it a question in Slack and it checks both your wiki (Notion, Confluence, or Google Drive) and your Slack history, tells you which one is current, and if they contradict each other — it drafts the doc update for you. One click to push it back to the wiki.

## What it does

- **Q&A with conflict detection** — `@lore what's our rollback process?` searches your wiki and Slack history, answers with sources, and flags it if the two disagree.
- **Doc update drafting** — when a conflict is found, click "Update the doc →" and Lore drafts a before/after edit from the newer Slack discussion. Approve it and it writes back to the wiki directly.
- **Expertise finding** — `@lore who knows about our auth system?` ranks the most relevant people from Slack activity and wiki authorship, with a button to loop them in.

## Local Set-up Instructions

 **The below setup instructions are for local development only**: running `npm run dev` on your own machine with an ngrok tunnel. That means Lore is only online while your terminal and ngrok are both running. That's fine for testing and personal use, but if you want it running continuously for a team, you'd need to deploy it somewhere that stays on (not covered here).


## Requirements

- Node.js >= 20
- A Slack workspace where you can install apps
- [ngrok](https://ngrok.com) (free tier is fine) — needed because wiki OAuth providers redirect to a public HTTPS URL, and `localhost` doesn't qualify
- An [Anthropic API key](https://console.anthropic.com)
- At least one of: a Notion, Confluence, or Google Cloud developer account, to register a wiki OAuth app

## Setup

### 1. Clone and install

```bash
git clone <this-repo-url>
cd lore
npm install
```

### 2. Create the Slack app

Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch** → name it "Lore" → pick your workspace.

**Socket Mode** (left sidebar):
- Toggle it on. You'll be prompted to generate an app-level token — give it the `connections:write` scope. Save this as `SLACK_APP_TOKEN` (starts with `xapp-`).

**OAuth & Permissions** → Bot Token Scopes, add:
```
app_mentions:read
chat:write
im:history
im:read
im:write
channels:history
channels:read
groups:history
groups:read
search:read
users:read
users:read.email
```

**Event Subscriptions**:
- Toggle it on (no Request URL needed — Socket Mode delivers events over the websocket instead).
- Under "Subscribe to bot events," add: `app_mention`, `app_home_opened`, `message.im`.

**Interactivity & Shortcuts**:
- Toggle it on (again, no Request URL needed with Socket Mode).

**App Home**:
- Enable the **Messages Tab**, and check "Allow users to send Slash commands and messages from the messages tab" — this is what lets people DM Lore directly.

**Install App to Workspace** (top of OAuth & Permissions):
- Copy the **Bot User OAuth Token** (starts with `xoxb-`) → `SLACK_BOT_TOKEN`.
- Go to **Basic Information** → copy the **Signing Secret** → `SLACK_SIGNING_SECRET`.

### 3. Get an Anthropic API key

[console.anthropic.com](https://console.anthropic.com) → API keys → create one → `ANTHROPIC_API_KEY`.

### 4. Start ngrok and get your BASE_URL

You need this *before* registering wiki OAuth apps, since they ask for a redirect URL.

```bash
ngrok http 3000
```

Copy the `https://xxxx.ngrok-free.app` forwarding URL it prints — that's your `BASE_URL` for now.

> **Heads up:** on ngrok's free tier, this URL changes every time you restart ngrok. When that happens you'll need to update `BASE_URL` in `.env`, restart `npm run dev`, and update the redirect URI in whichever wiki provider(s) you registered below — then reconnect the wiki from Slack. This is the main friction point of running locally; it goes away if you ever move to a host with a permanent URL.

### 5. Register wiki OAuth app(s)

You only need to set up the provider(s) you actually plan to connect — Lore works fine with just one.

**Notion:**
1. [notion.so/my-integrations](https://www.notion.so/my-integrations) → New integration.
2. **Important:** set the integration type to **Public**, not Internal — internal integrations skip OAuth entirely and won't work with the connect flow here.
3. Redirect URI: `<BASE_URL>/oauth/notion/callback`
4. Copy the OAuth client ID/secret → `NOTION_CLIENT_ID` / `NOTION_CLIENT_SECRET`.

**Confluence (Atlassian):**
1. [developer.atlassian.com/console/myapps](https://developer.atlassian.com/console/myapps) → Create → OAuth 2.0 (3LO) integration.
2. Add permissions for the Confluence API (read + write content) and `offline_access`.
3. Redirect URI: `<BASE_URL>/oauth/confluence/callback`
4. Copy the client ID/secret → `CONFLUENCE_CLIENT_ID` / `CONFLUENCE_CLIENT_SECRET`.

**Google Drive:**
1. [console.cloud.google.com](https://console.cloud.google.com) → new project → enable the Drive API and Docs API.
2. Configure the OAuth consent screen.
3. Credentials → OAuth client ID → Web application.
4. Redirect URI: `<BASE_URL>/oauth/drive/callback`
5. Copy the client ID/secret → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
6. Note: Google gates apps requesting Drive/Docs scopes behind app verification once used by anyone outside a small list of test users — fine for solo/local use, but relevant if others will connect their own Google accounts.

### 6. Configure environment

```bash
cp .env.example .env
```

Fill in every value — Slack tokens from step 2, `ANTHROPIC_API_KEY` from step 3, `BASE_URL` from step 4, and whichever wiki client ID/secret pairs from step 5.

### 7. Run it

You need two terminals running at the same time, for as long as you want Lore online:

```bash
# terminal 1
ngrok http 3000

# terminal 2
npm run dev
```

### 8. Connect it in Slack

Open your workspace, find Lore under Apps, and open its Home tab (or just DM it) — this triggers the welcome message with wiki-connect buttons. Connect a wiki, pick the channels to watch, and you're set up.

## Environment variables

| Variable | Where it comes from |
|---|---|
| `SLACK_BOT_TOKEN` | Slack app → OAuth & Permissions → Bot User OAuth Token |
| `SLACK_SIGNING_SECRET` | Slack app → Basic Information |
| `SLACK_APP_TOKEN` | Slack app → Socket Mode app-level token |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `ANTHROPIC_MODEL` | defaults to a Claude Sonnet model — override if you want a different one |
| `PORT` | local port for the OAuth callback server (default `3000`) |
| `BASE_URL` | your current ngrok HTTPS URL |
| `NOTION_CLIENT_ID` / `NOTION_CLIENT_SECRET` | Notion public integration (optional — only if using Notion) |
| `CONFLUENCE_CLIENT_ID` / `CONFLUENCE_CLIENT_SECRET` | Atlassian OAuth 2.0 (3LO) app (optional — only if using Confluence) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth client (optional — only if using Drive) |

## Data storage

Workspace config (which wiki is connected, which channels are watched) is stored locally in `data/workspaces.json`. No document content is ever stored — only OAuth tokens and this config. This file persists across restarts as long as you're running from the same machine/folder.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    SLACK SURFACE                     │
│         DM │ @mention │ Button actions               │
└──────────────────────┬──────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────┐
│                  BOLT APP (TypeScript)                │
│         Event listener │ Action handler               │
│         OAuth callback │ Command handler              │
└──────┬───────────────────────────┬────────────────────┘
       │                           │
┌──────▼──────┐           ┌────────▼────────┐
│  RTS Layer  │           │   MCP Layer     │
│ Search Slack│           │ Notion          │
│ threads by  │           │ Confluence      │
│ topic       │           │ Google Drive    │
└──────┬──────┘           └────────┬────────┘
       │                           │
       └─────────────┬─────────────┘
                      │
          ┌───────────▼───────────┐
          │   CONTEXT ASSEMBLER   │
          └───────────┬───────────┘
                      │
          ┌───────────▼───────────┐
          │    CLAUDE (Sonnet)    │
          │  Answer / Conflict /  │
          │  Draft / Expertise    │
          └───────────┬───────────┘
                      │
          ┌───────────▼───────────┐
          │   RESPONSE LAYER      │
          │  Block Kit UI, wiki   │
          │  write-back           │
          └───────────────────────┘
```

**Stack:** TypeScript, Slack Bolt, Claude (Anthropic API), Slack Real-Time Search (RTS) for thread retrieval, Notion/Confluence/Google Drive for wiki access.

## Claude prompts

**Prompt 1 — Answer + conflict detection** (`src/claude/answer.ts`): given wiki doc chunks and Slack thread chunks on a topic, decides whether the sources agree, contradict, are additive, or are insufficient — and answers or flags a conflict accordingly.

**Prompt 2 — Doc update drafter** (`src/claude/draft.ts`): given a full wiki doc and a Slack thread with newer info, drafts a minimal before/after edit, matching the doc's existing tone.

**Prompt 3 — Expertise finder** (`src/claude/expertise.ts`): given Slack activity data and wiki authorship data for a set of candidates, ranks the top 3 experts on a topic with cited reasons.

## Implementation status

| Phase | Status |
|---|---|
| 1 — Scaffold | ✅ Done |
| 2 — Onboarding | ✅ Done |
| 3 — RTS integration | ✅ Done |
| 4 — MCP integration | ✅ Done (Notion verified live; Confluence/Drive implemented but untested against real accounts) |
| 5 — Core Q&A + conflict detection | ✅ Done, verified live |
| 6 — Doc update flow | ✅ Done (Notion write-back verified; Confluence/Drive untested) |
| 7 — Expertise finding | ✅ Done, untested end-to-end |
| 8 — Polish + demo prep | ⬜ Not started |

## File structure

```
/lore
  /src
    app.ts                    ← Bolt entry point, event routing
    /handlers
      question.ts             ← DM + @mention question routing (Q&A, conflict, source inventory, expertise dispatch)
      update.ts                ← doc update draft + approve/discard actions
      expertise.ts             ← expertise finding flow + "Message X" action
      onboarding.ts             ← install flow, wiki OAuth kickoff, channel setup
    /mcp
      notion.ts                ← Notion search + read + write-back
      confluence.ts             ← Confluence search + read + write-back
      drive.ts                  ← Google Drive search + read + write-back
      index.ts                  ← unified MCP interface (dispatches by provider)
      types.ts
    /rts
      search.ts                 ← RTS API wrapper, thread retrieval
      activity.ts                ← user activity aggregation for expertise
    /claude
      answer.ts                 ← Prompt 1 — answer + conflict detection
      draft.ts                   ← Prompt 2 — doc update drafter
      expertise.ts                ← Prompt 3 — expertise finder
      index.ts                    ← shared Anthropic client
      types.ts
    /blocks
      answerCard.ts               ← Block Kit: answer UI
      conflictCard.ts              ← Block Kit: conflict warning UI
      updateCard.ts                 ← Block Kit: draft update UI
      expertCard.ts                  ← Block Kit: expertise UI
      onboardingCard.ts                ← Block Kit: onboarding UI
      sourcesCard.ts / searchCard.ts / wikiSearchCard.ts ← source inventory UI
    /auth
      routes.ts                       ← OAuth callback routes for all wiki providers
      oauth-state.ts                   ← signed OAuth state tokens
      notion.ts / confluence.ts / drive.ts ← per-provider OAuth exchange + refresh
    /config
      workspace.ts                     ← per-workspace config (channels, wiki connection), file-backed
      wikiToken.ts                      ← wiki access token refresh
    /context
      assembler.ts                      ← bundles wiki + Slack chunks for Claude
      pendingUpdates.ts                  ← in-memory store bridging conflict → draft → approval
    /utils
      keywords.ts                        ← keyword/topic extraction, query classification
      formatter.ts / channels.ts / dedupe.ts
  data/workspaces.json                    ← local per-workspace config store (gitignored)
  .env
  package.json
  README.md
```
