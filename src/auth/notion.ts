import type { WikiConnection } from "../config/workspace.js";
import { createOAuthState } from "./oauth-state.js";

function baseUrl(): string {
  const url = process.env.BASE_URL;
  if (!url) {
    throw new Error("BASE_URL is required for wiki OAuth");
  }
  return url.replace(/\/$/, "");
}

function notionCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("NOTION_CLIENT_ID and NOTION_CLIENT_SECRET are required");
  }
  return { clientId, clientSecret };
}

export function isNotionConfigured(): boolean {
  return Boolean(process.env.NOTION_CLIENT_ID && process.env.NOTION_CLIENT_SECRET);
}

export function getNotionAuthUrl(teamId: string, userId: string): string {
  const { clientId } = notionCredentials();
  const redirectUri = `${baseUrl()}/oauth/notion/callback`;
  const state = createOAuthState(teamId, userId, "notion");

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    owner: "user",
    redirect_uri: redirectUri,
    state,
  });

  return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
}

interface NotionTokenResponse {
  access_token: string;
  workspace_id: string;
  workspace_name?: string;
  bot_id: string;
}

export async function exchangeNotionCode(code: string): Promise<WikiConnection> {
  const { clientId, clientSecret } = notionCredentials();
  const redirectUri = `${baseUrl()}/oauth/notion/callback`;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Notion token exchange failed: ${body}`);
  }

  const data = (await response.json()) as NotionTokenResponse;
  return {
    provider: "notion",
    accessToken: data.access_token,
    workspaceId: data.workspace_id,
    workspaceName: data.workspace_name,
  };
}
