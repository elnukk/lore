import type { WikiConnection } from "../config/workspace.js";
import { createOAuthState } from "./oauth-state.js";

const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/documents",
].join(" ");

function baseUrl(): string {
  const url = process.env.BASE_URL;
  if (!url) {
    throw new Error("BASE_URL is required for wiki OAuth");
  }
  return url.replace(/\/$/, "");
}

function googleCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required");
  }
  return { clientId, clientSecret };
}

export function isGoogleDriveConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function getGoogleDriveAuthUrl(teamId: string, userId: string): string {
  const { clientId } = googleCredentials();
  const redirectUri = `${baseUrl()}/oauth/drive/callback`;
  const state = createOAuthState(teamId, userId, "drive");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export async function exchangeGoogleDriveCode(
  code: string,
): Promise<WikiConnection> {
  const { clientId, clientSecret } = googleCredentials();
  const redirectUri = `${baseUrl()}/oauth/drive/callback`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Drive token exchange failed: ${body}`);
  }

  const data = (await response.json()) as GoogleTokenResponse;
  return {
    provider: "drive",
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in
      ? Date.now() + data.expires_in * 1000
      : undefined,
    workspaceName: "Google Drive",
  };
}

export interface RefreshedTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export async function refreshGoogleDriveToken(
  refreshToken: string,
): Promise<RefreshedTokens> {
  const { clientId, clientSecret } = googleCredentials();

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Drive token refresh failed: ${body}`);
  }

  const data = (await response.json()) as GoogleTokenResponse;

  return {
    accessToken: data.access_token,
    // Google usually omits refresh_token on refresh responses — the original stays valid.
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in
      ? Date.now() + data.expires_in * 1000
      : undefined,
  };
}
