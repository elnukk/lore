import type { IRouter } from "express";
import type { WebClient } from "@slack/web-api";
import {
  getWorkspace,
  isOnboardingComplete,
  setWikiConnection,
} from "../config/workspace.js";
import {
  channelSelectionBlocks,
  setupCompleteBlocks,
  wikiConnectedBlocks,
} from "../blocks/onboardingCard.js";
import { parseOAuthState } from "./oauth-state.js";
import {
  exchangeConfluenceCode,
  getConfluenceAuthUrl,
  isConfluenceConfigured,
} from "./confluence.js";
import {
  exchangeGoogleDriveCode,
  getGoogleDriveAuthUrl,
  isGoogleDriveConfigured,
} from "./drive.js";
import {
  exchangeNotionCode,
  getNotionAuthUrl,
  isNotionConfigured,
} from "./notion.js";

const WIKI_LABELS = {
  notion: "Notion",
  confluence: "Confluence",
  drive: "Google Drive",
} as const;

import { resolveChannelNames } from "../utils/channels.js";

export async function sendSetupCompleteMessage(
  client: WebClient,
  teamId: string,
  userId: string,
): Promise<void> {
  const config = await getWorkspace(teamId);
  if (!isOnboardingComplete(config)) {
    return;
  }

  const channelNames = await resolveChannelNames(
    client,
    config.watchedChannels,
  );

  await client.chat.postMessage({
    channel: userId,
    text: `You're set up. I'm now watching ${channelNames.map((name) => `#${name}`).join(", ")}.`,
    blocks: setupCompleteBlocks(channelNames),
  });
}

function oauthErrorPage(message: string): string {
  return `<!DOCTYPE html>
<html>
  <head><title>Lore</title></head>
  <body style="font-family: sans-serif; max-width: 520px; margin: 48px auto;">
    <h1>Connection failed</h1>
    <p>${message}</p>
    <p>Return to Slack and try again.</p>
  </body>
</html>`;
}

function oauthSuccessPage(provider: string): string {
  return `<!DOCTYPE html>
<html>
  <head><title>Lore</title></head>
  <body style="font-family: sans-serif; max-width: 520px; margin: 48px auto;">
    <h1>${provider} connected</h1>
    <p>You can close this tab and return to Slack.</p>
  </body>
</html>`;
}

export function registerOAuthRoutes(
  router: IRouter,
  slackClient: WebClient,
): void {
  router.get("/oauth/notion/start", (req, res) => {
    try {
      if (!isNotionConfigured()) {
        res.status(400).send(oauthErrorPage("Notion OAuth is not configured."));
        return;
      }

      const teamId = String(req.query.team_id ?? "");
      const userId = String(req.query.user_id ?? "");
      if (!teamId || !userId) {
        res.status(400).send(oauthErrorPage("Missing team_id or user_id."));
        return;
      }

      res.redirect(getNotionAuthUrl(teamId, userId));
    } catch (error) {
      res
        .status(500)
        .send(oauthErrorPage(error instanceof Error ? error.message : "Unknown error"));
    }
  });

  router.get("/oauth/confluence/start", (req, res) => {
    try {
      if (!isConfluenceConfigured()) {
        res
          .status(400)
          .send(oauthErrorPage("Confluence OAuth is not configured."));
        return;
      }

      const teamId = String(req.query.team_id ?? "");
      const userId = String(req.query.user_id ?? "");
      if (!teamId || !userId) {
        res.status(400).send(oauthErrorPage("Missing team_id or user_id."));
        return;
      }

      res.redirect(getConfluenceAuthUrl(teamId, userId));
    } catch (error) {
      res
        .status(500)
        .send(oauthErrorPage(error instanceof Error ? error.message : "Unknown error"));
    }
  });

  router.get("/oauth/drive/start", (req, res) => {
    try {
      if (!isGoogleDriveConfigured()) {
        res
          .status(400)
          .send(oauthErrorPage("Google Drive OAuth is not configured."));
        return;
      }

      const teamId = String(req.query.team_id ?? "");
      const userId = String(req.query.user_id ?? "");
      if (!teamId || !userId) {
        res.status(400).send(oauthErrorPage("Missing team_id or user_id."));
        return;
      }

      res.redirect(getGoogleDriveAuthUrl(teamId, userId));
    } catch (error) {
      res
        .status(500)
        .send(oauthErrorPage(error instanceof Error ? error.message : "Unknown error"));
    }
  });

  router.get("/oauth/notion/callback", async (req, res) => {
    await handleOAuthCallback(req, res, slackClient, "notion", exchangeNotionCode);
  });

  router.get("/oauth/confluence/callback", async (req, res) => {
    await handleOAuthCallback(
      req,
      res,
      slackClient,
      "confluence",
      exchangeConfluenceCode,
    );
  });

  router.get("/oauth/drive/callback", async (req, res) => {
    await handleOAuthCallback(req, res, slackClient, "drive", exchangeGoogleDriveCode);
  });
}

async function handleOAuthCallback(
  req: { query: Record<string, unknown> },
  res: { status: (code: number) => { send: (body: string) => void } },
  slackClient: WebClient,
  provider: keyof typeof WIKI_LABELS,
  exchange: (code: string) => Promise<Awaited<ReturnType<typeof exchangeNotionCode>>>,
): Promise<void> {
  try {
    const error = String(req.query.error ?? "");
    if (error) {
      res.status(400).send(oauthErrorPage(`OAuth denied: ${error}`));
      return;
    }

    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");
    if (!code || !state) {
      res.status(400).send(oauthErrorPage("Missing OAuth code or state."));
      return;
    }

    const { teamId, userId } = parseOAuthState(state);
    const wiki = await exchange(code);
    await setWikiConnection(teamId, wiki, userId);

    await slackClient.chat.postMessage({
      channel: userId,
      text: `${WIKI_LABELS[provider]} connected.`,
      blocks: wikiConnectedBlocks(provider),
    });

    res.status(200).send(oauthSuccessPage(WIKI_LABELS[provider]));
  } catch (error) {
    res
      .status(500)
      .send(oauthErrorPage(error instanceof Error ? error.message : "Unknown error"));
  }
}

export { resolveChannelNames };
