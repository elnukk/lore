import { refreshConfluenceToken } from "../auth/confluence.js";
import { refreshGoogleDriveToken } from "../auth/drive.js";
import { saveWorkspace } from "./workspace.js";
import type { WikiConnection, WorkspaceConfig } from "./workspace.js";

const EXPIRY_BUFFER_MS = 2 * 60_000;

/**
 * Returns a wiki connection guaranteed to have a live access token, refreshing
 * and persisting it first if it's expired (or about to expire). Notion tokens
 * have no expiry/refresh_token, so they pass through unchanged.
 */
export async function ensureFreshWiki(
  config: WorkspaceConfig,
): Promise<WikiConnection | undefined> {
  const wiki = config.wiki;
  if (!wiki || !wiki.refreshToken || !wiki.expiresAt) {
    return wiki;
  }

  if (Date.now() < wiki.expiresAt - EXPIRY_BUFFER_MS) {
    return wiki;
  }

  try {
    const refreshed =
      wiki.provider === "confluence"
        ? await refreshConfluenceToken(wiki.refreshToken)
        : wiki.provider === "drive"
          ? await refreshGoogleDriveToken(wiki.refreshToken)
          : undefined;

    if (!refreshed) {
      return wiki;
    }

    const updatedWiki: WikiConnection = {
      ...wiki,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? wiki.refreshToken,
      expiresAt: refreshed.expiresAt,
    };

    config.wiki = updatedWiki;
    await saveWorkspace(config);

    return updatedWiki;
  } catch (error) {
    console.error(
      `Failed to refresh ${wiki.provider} token for team ${config.teamId}:`,
      error,
    );
    return wiki;
  }
}
