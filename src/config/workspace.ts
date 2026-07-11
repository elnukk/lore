import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type WikiProvider = "notion" | "confluence" | "drive";

export interface WikiConnection {
  provider: WikiProvider;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  workspaceId?: string;
  workspaceName?: string;
}

export interface WorkspaceConfig {
  teamId: string;
  wiki?: WikiConnection;
  watchedChannels: string[];
  onboardedBy?: string;
  updatedAt: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "workspaces.json");

type WorkspaceStore = Record<string, WorkspaceConfig>;

async function loadStore(): Promise<WorkspaceStore> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    return JSON.parse(raw) as WorkspaceStore;
  } catch {
    return {};
  }
}

async function saveStore(store: WorkspaceStore): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function emptyConfig(teamId: string): WorkspaceConfig {
  return {
    teamId,
    watchedChannels: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function getWorkspace(teamId: string): Promise<WorkspaceConfig> {
  const store = await loadStore();
  return store[teamId] ?? emptyConfig(teamId);
}

export async function saveWorkspace(config: WorkspaceConfig): Promise<void> {
  const store = await loadStore();
  store[config.teamId] = {
    ...config,
    updatedAt: new Date().toISOString(),
  };
  await saveStore(store);
}

export async function setWikiConnection(
  teamId: string,
  wiki: WikiConnection,
  userId: string,
): Promise<WorkspaceConfig> {
  const config = await getWorkspace(teamId);
  config.wiki = wiki;
  config.onboardedBy = userId;
  await saveWorkspace(config);
  return config;
}

export async function setWatchedChannels(
  teamId: string,
  channelIds: string[],
): Promise<WorkspaceConfig> {
  const config = await getWorkspace(teamId);
  config.watchedChannels = channelIds;
  await saveWorkspace(config);
  return config;
}

export function isOnboardingComplete(config: WorkspaceConfig): boolean {
  return Boolean(config.wiki) && config.watchedChannels.length > 0;
}
