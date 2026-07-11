import type { WikiConnection } from "../config/workspace.js";
import { createOAuthState } from "./oauth-state.js";

const SCOPES = [
  "read:confluence-content.all",
  "write:confluence-content",
  "read:confluence-space.summary",
  "offline_access",
].join(" ");

function baseUrl(): string {
  const url = process.env.BASE_URL;
  if (!url) {
    throw new Error("BASE_URL is required for wiki OAuth");
  }
  return url.replace(/\/$/, "");
}

function confluenceCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.CONFLUENCE_CLIENT_ID;
  const clientSecret = process.env.CONFLUENCE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "CONFLUENCE_CLIENT_ID and CONFLUENCE_CLIENT_SECRET are required",
    );
  }
  return { clientId, clientSecret };
}

export function isConfluenceConfigured(): boolean {
  return Boolean(
    process.env.CONFLUENCE_CLIENT_ID && process.env.CONFLUENCE_CLIENT_SECRET,
  );
}

export function getConfluenceAuthUrl(teamId: string, userId: string): string {
  const { clientId } = confluenceCredentials();
  const redirectUri = `${baseUrl()}/oauth/confluence/callback`;
  const state = createOAuthState(teamId, userId, "confluence");

  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    prompt: "consent",
  });

  return `https://auth.atlassian.com/authorize?${params.toString()}`;
}

interface AtlassianTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

interface AccessibleResource {
  id: string;
  name: string;
  url: string;
  scopes: string[];
}

export async function exchangeConfluenceCode(
  code: string,
): Promise<WikiConnection> {
  const { clientId, clientSecret } = confluenceCredentials();
  const redirectUri = `${baseUrl()}/oauth/confluence/callback`;

  const tokenResponse = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text();
    throw new Error(`Confluence token exchange failed: ${body}`);
  }

  const tokens = (await tokenResponse.json()) as AtlassianTokenResponse;

  const resourcesResponse = await fetch(
    "https://api.atlassian.com/oauth/token/accessible-resources",
    {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        Accept: "application/json",
      },
    },
  );

  if (!resourcesResponse.ok) {
    const body = await resourcesResponse.text();
    throw new Error(`Confluence resource lookup failed: ${body}`);
  }

  const resources = (await resourcesResponse.json()) as AccessibleResource[];
  const confluenceSite = resources.find((resource) =>
    resource.scopes.some((scope) => scope.includes("confluence")),
  );

  return {
    provider: "confluence",
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expires_in
      ? Date.now() + tokens.expires_in * 1000
      : undefined,
    workspaceId: confluenceSite?.id,
    workspaceName: confluenceSite?.name,
  };
}

export interface RefreshedTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export async function refreshConfluenceToken(
  refreshToken: string,
): Promise<RefreshedTokens> {
  const { clientId, clientSecret } = confluenceCredentials();

  const response = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Confluence token refresh failed: ${body}`);
  }

  const tokens = (await response.json()) as AtlassianTokenResponse;

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expires_in
      ? Date.now() + tokens.expires_in * 1000
      : undefined,
  };
}
