import type { WikiConnection } from "../config/workspace.js";
import { searchConfluenceDocs, updateConfluenceDoc } from "./confluence.js";
import { searchDriveDocs, updateDriveDoc } from "./drive.js";
import { listNotionDocs, searchNotionDocs, updateNotionDoc } from "./notion.js";
import type { DocChunk, DocUpdatePatch, WikiSearchOptions } from "./types.js";

export type { DocChunk, DocUpdatePatch, WikiSearchOptions } from "./types.js";

export async function searchWikiDocs(
  wiki: WikiConnection,
  options: WikiSearchOptions,
): Promise<DocChunk[]> {
  switch (wiki.provider) {
    case "notion":
      return searchNotionDocs(wiki, options);
    case "confluence":
      return searchConfluenceDocs(wiki, options);
    case "drive":
      return searchDriveDocs(wiki, options);
    default:
      throw new Error(`Unsupported wiki provider: ${wiki.provider as string}`);
  }
}

export async function listWikiDocs(
  wiki: WikiConnection,
  limit = 20,
): Promise<DocChunk[]> {
  switch (wiki.provider) {
    case "notion":
      return listNotionDocs(wiki, limit);
    case "confluence":
      return searchConfluenceDocs(wiki, { query: "", limit });
    case "drive":
      return searchDriveDocs(wiki, { query: "", limit });
    default:
      throw new Error(`Unsupported wiki provider: ${wiki.provider as string}`);
  }
}

export async function updateWikiDoc(
  wiki: WikiConnection,
  docId: string,
  patch: DocUpdatePatch,
): Promise<void> {
  switch (wiki.provider) {
    case "notion":
      return updateNotionDoc(wiki, docId, patch);
    case "confluence":
      return updateConfluenceDoc(wiki, docId, patch);
    case "drive":
      return updateDriveDoc(wiki, docId, patch);
    default:
      throw new Error(`Unsupported wiki provider: ${wiki.provider as string}`);
  }
}

export { searchNotionDocs, listNotionDocs, updateNotionDoc } from "./notion.js";
export { searchConfluenceDocs, updateConfluenceDoc } from "./confluence.js";
export { searchDriveDocs, updateDriveDoc } from "./drive.js";
