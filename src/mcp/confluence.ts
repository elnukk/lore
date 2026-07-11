import type { WikiConnection } from "../config/workspace.js";
import { buildExcerpt, stripHtml } from "../utils/formatter.js";
import type { DocChunk, DocUpdatePatch, WikiSearchOptions } from "./types.js";

interface ConfluenceUser {
  displayName?: string;
  email?: string;
}

interface ConfluenceSearchResult {
  id: string;
  title?: string;
  excerpt?: string;
  lastModified?: string;
  version?: { by?: ConfluenceUser };
  _links?: {
    webui?: string;
    base?: string;
  };
}

interface ConfluenceSearchResponse {
  results: ConfluenceSearchResult[];
}

interface ConfluenceContentResponse {
  id: string;
  title?: string;
  body?: {
    storage?: {
      value?: string;
    };
  };
  version?: {
    number: number;
    by?: ConfluenceUser;
  };
  _links?: {
    webui?: string;
    base?: string;
  };
}

function confluenceBaseUrl(wiki: WikiConnection): string {
  if (!wiki.workspaceId) {
    throw new Error("Confluence cloud ID is missing from workspace config");
  }

  return `https://api.atlassian.com/ex/confluence/${wiki.workspaceId}`;
}

async function confluenceRequest<T>(
  wiki: WikiConnection,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${confluenceBaseUrl(wiki)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${wiki.accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Confluence API error: ${body}`);
  }

  return (await response.json()) as T;
}

function confluencePageUrl(
  wiki: WikiConnection,
  result: ConfluenceSearchResult | ConfluenceContentResponse,
): string {
  const webui = result._links?.webui;
  const base = result._links?.base ?? wiki.workspaceName;

  if (webui?.startsWith("http")) {
    return webui;
  }

  if (webui && base?.startsWith("http")) {
    return `${base.replace(/\/$/, "")}${webui}`;
  }

  if (webui && wiki.workspaceId) {
    return `https://${wiki.workspaceId}.atlassian.net${webui}`;
  }

  return "";
}

export async function searchConfluenceDocs(
  wiki: WikiConnection,
  options: WikiSearchOptions,
): Promise<DocChunk[]> {
  const limit = options.limit ?? 5;
  const escapedQuery = options.query.replace(/"/g, '\\"');
  const cql = encodeURIComponent(`text ~ "${escapedQuery}"`);
  const searchPath = `/wiki/rest/api/content/search?cql=${cql}&limit=${Math.min(limit * 2, 20)}&expand=body.storage,version`;

  const searchResponse = await confluenceRequest<ConfluenceSearchResponse>(
    wiki,
    searchPath,
  );

  const chunks: DocChunk[] = [];

  for (const result of searchResponse.results.slice(0, limit)) {
    let content = stripHtml(result.excerpt ?? "");
    let title = result.title ?? "Untitled";
    let authorName = result.version?.by?.displayName;
    let authorEmail = result.version?.by?.email;

    if (!content) {
      const page = await confluenceRequest<ConfluenceContentResponse>(
        wiki,
        `/wiki/rest/api/content/${result.id}?expand=body.storage,version`,
      );
      title = page.title ?? title;
      content = stripHtml(page.body?.storage?.value ?? "");
      authorName = authorName ?? page.version?.by?.displayName;
      authorEmail = authorEmail ?? page.version?.by?.email;
    }

    chunks.push({
      title,
      content,
      excerpt: buildExcerpt(content || title, options.query),
      authorName,
      authorEmail,
      url: confluencePageUrl(wiki, result),
      date: result.lastModified ?? new Date().toISOString(),
      docId: result.id,
      provider: "confluence",
    });
  }

  return chunks;
}

export async function updateConfluenceDoc(
  wiki: WikiConnection,
  docId: string,
  patch: DocUpdatePatch,
): Promise<void> {
  const page = await confluenceRequest<ConfluenceContentResponse>(
    wiki,
    `/wiki/rest/api/content/${docId}?expand=body.storage,version`,
  );

  const rawBody = page.body?.storage?.value ?? "";
  if (!rawBody.includes(patch.before)) {
    throw new Error(
      'Couldn\'t locate the exact text to replace in Confluence. Use "Edit first" instead.',
    );
  }

  const updatedBody = rawBody.split(patch.before).join(patch.after);
  const nextVersion = (page.version?.number ?? 1) + 1;

  await confluenceRequest(wiki, `/wiki/rest/api/content/${docId}`, {
    method: "PUT",
    body: JSON.stringify({
      id: docId,
      type: "page",
      title: page.title,
      version: { number: nextVersion },
      body: { storage: { value: updatedBody, representation: "storage" } },
    }),
  });
}
