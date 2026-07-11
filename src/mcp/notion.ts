import type { WikiConnection } from "../config/workspace.js";
import { buildExcerpt } from "../utils/formatter.js";
import { extractSearchTerms, scoreTextMatch } from "../utils/keywords.js";
import type { DocChunk, DocUpdatePatch, WikiSearchOptions } from "./types.js";

const NOTION_VERSION = "2022-06-28";

interface NotionRichText {
  plain_text?: string;
}

interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
}

interface NotionSearchResult {
  id: string;
  object: string;
  last_edited_time?: string;
  last_edited_by?: { id: string };
  url?: string;
  properties?: Record<
    string,
    {
      type?: string;
      title?: NotionRichText[];
    }
  >;
}

interface NotionUserResponse {
  id: string;
  name?: string;
  type?: string;
  person?: { email?: string };
}

const notionUserCache = new Map<string, { name?: string; email?: string }>();

async function resolveNotionUser(
  accessToken: string,
  userId: string,
): Promise<{ name?: string; email?: string }> {
  const cached = notionUserCache.get(userId);
  if (cached) {
    return cached;
  }

  try {
    const user = await notionRequest<NotionUserResponse>(
      accessToken,
      `/users/${userId}`,
    );
    const resolved = { name: user.name, email: user.person?.email };
    notionUserCache.set(userId, resolved);
    return resolved;
  } catch {
    const fallback = {};
    notionUserCache.set(userId, fallback);
    return fallback;
  }
}

async function notionRequest<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Notion API error: ${body}`);
  }

  return (await response.json()) as T;
}

function getNotionPageTitle(page: NotionSearchResult): string {
  if (!page.properties) {
    return "Untitled";
  }

  for (const property of Object.values(page.properties)) {
    if (property.type === "title" && property.title?.length) {
      return property.title.map((part) => part.plain_text ?? "").join("") || "Untitled";
    }
  }

  return "Untitled";
}

function extractRichText(richText: unknown): string {
  if (!Array.isArray(richText)) {
    return "";
  }

  return richText
    .map((part) => (part as NotionRichText).plain_text ?? "")
    .join("");
}

function extractBlockText(block: NotionBlock): string {
  const payload = block[block.type];
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const data = payload as Record<string, unknown>;

  if (Array.isArray(data.rich_text)) {
    return extractRichText(data.rich_text);
  }

  if (Array.isArray(data.text)) {
    return extractRichText(data.text);
  }

  return "";
}

async function fetchBlockChildren(
  accessToken: string,
  blockId: string,
): Promise<NotionBlock[]> {
  const blocks: NotionBlock[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ page_size: "100" });
    if (cursor) {
      params.set("start_cursor", cursor);
    }

    const response = await notionRequest<{
      results: NotionBlock[];
      has_more: boolean;
      next_cursor?: string;
    }>(accessToken, `/blocks/${blockId}/children?${params.toString()}`);

    blocks.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return blocks;
}

async function fetchNotionBlockText(
  accessToken: string,
  blockId: string,
  depth = 0,
): Promise<string> {
  if (depth > 2) {
    return "";
  }

  const blocks = await fetchBlockChildren(accessToken, blockId);
  const parts: string[] = [];

  for (const block of blocks) {
    const text = extractBlockText(block);
    if (text) {
      parts.push(text);
    }

    if (block.has_children) {
      const childText = await fetchNotionBlockText(
        accessToken,
        block.id,
        depth + 1,
      );
      if (childText) {
        parts.push(childText);
      }
    }
  }

  return parts.join("\n");
}

function notionPageUrl(page: NotionSearchResult): string {
  if (page.url) {
    return page.url;
  }

  return `https://www.notion.so/${page.id.replace(/-/g, "")}`;
}

async function searchNotionPages(
  accessToken: string,
  query: string,
  pageSize: number,
): Promise<NotionSearchResult[]> {
  const searchResponse = await notionRequest<{
    results: NotionSearchResult[];
  }>(accessToken, "/search", {
    method: "POST",
    body: JSON.stringify({
      query,
      page_size: pageSize,
      filter: {
        property: "object",
        value: "page",
      },
      sort: {
        direction: "descending",
        timestamp: "last_edited_time",
      },
    }),
  });

  return searchResponse.results.filter((result) => result.object === "page");
}

async function listAccessibleNotionPages(
  accessToken: string,
  pageSize: number,
): Promise<NotionSearchResult[]> {
  return searchNotionPages(accessToken, "", pageSize);
}

async function pageToChunk(
  page: NotionSearchResult,
  accessToken: string,
  query: string,
): Promise<DocChunk> {
  const title = getNotionPageTitle(page);
  const content = await fetchNotionBlockText(accessToken, page.id);
  const author = page.last_edited_by?.id
    ? await resolveNotionUser(accessToken, page.last_edited_by.id)
    : {};

  return {
    title,
    content,
    excerpt: buildExcerpt(content || title, query),
    url: notionPageUrl(page),
    date: page.last_edited_time ?? new Date().toISOString(),
    docId: page.id,
    provider: "notion",
    authorName: author.name,
    authorEmail: author.email,
  };
}

export async function searchNotionDocs(
  wiki: WikiConnection,
  options: WikiSearchOptions,
): Promise<DocChunk[]> {
  const limit = options.limit ?? 5;
  const searchTerms = extractSearchTerms(options.query);
  const candidateMap = new Map<string, NotionSearchResult>();

  const keywordQueries = [
    options.query,
    searchTerms.join(" "),
    ...searchTerms,
  ].filter((query, index, queries) => query && queries.indexOf(query) === index);

  for (const keywordQuery of keywordQueries) {
    const results = await searchNotionPages(
      wiki.accessToken,
      keywordQuery,
      Math.min(limit * 2, 20),
    );

    for (const page of results) {
      candidateMap.set(page.id, page);
    }
  }

  // Notion's /search endpoint mostly ranks by title match, so it can easily
  // fill the candidate set with title-plausible pages that don't actually
  // contain the answer. Always also pull the broader accessible-page list so
  // full-content scoring below gets a real shot at finding the right page,
  // rather than only considering whatever title search happened to surface.
  const accessiblePages = await listAccessibleNotionPages(
    wiki.accessToken,
    Math.min(limit * 6, 30),
  );

  for (const page of accessiblePages) {
    candidateMap.set(page.id, page);
  }

  const candidates = [...candidateMap.values()];
  if (candidates.length === 0) {
    return [];
  }

  const ranked = await Promise.all(
    candidates.map(async (page) => {
      const chunk = await pageToChunk(page, wiki.accessToken, options.query);
      const score = scoreTextMatch(
        `${chunk.title}\n${chunk.content}`,
        options.query,
      );

      return { chunk, score };
    }),
  );

  ranked.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    return Date.parse(b.chunk.date) - Date.parse(a.chunk.date);
  });

  const hasSearchTerms = searchTerms.length > 0;
  const topScored = ranked.filter((entry) => entry.score > 0);

  if (topScored.length > 0) {
    return topScored.slice(0, limit).map((entry) => entry.chunk);
  }

  if (!hasSearchTerms) {
    return ranked.slice(0, limit).map((entry) => entry.chunk);
  }

  return ranked.slice(0, limit).map((entry) => entry.chunk);
}

export async function listNotionDocs(
  wiki: WikiConnection,
  limit = 20,
): Promise<DocChunk[]> {
  const pages = await listAccessibleNotionPages(wiki.accessToken, limit);

  return Promise.all(
    pages.map((page) => pageToChunk(page, wiki.accessToken, "")),
  );
}

interface NotionTextBlock {
  id: string;
  type: string;
  text: string;
}

async function collectTextBlocks(
  accessToken: string,
  blockId: string,
  depth = 0,
): Promise<NotionTextBlock[]> {
  if (depth > 2) {
    return [];
  }

  const blocks = await fetchBlockChildren(accessToken, blockId);
  const collected: NotionTextBlock[] = [];

  for (const block of blocks) {
    const text = extractBlockText(block);
    if (text) {
      collected.push({ id: block.id, type: block.type, text });
    }

    if (block.has_children) {
      collected.push(
        ...(await collectTextBlocks(accessToken, block.id, depth + 1)),
      );
    }
  }

  return collected;
}

function buildFlexiblePattern(text: string): RegExp | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return null;
  }

  const escaped = words.map((word) =>
    word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );

  return new RegExp(escaped.join("\\s+"));
}

async function patchNotionBlockText(
  accessToken: string,
  blockId: string,
  blockType: string,
  text: string,
): Promise<void> {
  await notionRequest(accessToken, `/blocks/${blockId}`, {
    method: "PATCH",
    body: JSON.stringify({
      [blockType]: { rich_text: [{ type: "text", text: { content: text } }] },
    }),
  });
}

export async function updateNotionDoc(
  wiki: WikiConnection,
  docId: string,
  patch: DocUpdatePatch,
): Promise<void> {
  const blocks = await collectTextBlocks(wiki.accessToken, docId);

  for (const block of blocks) {
    if (block.text.includes(patch.before)) {
      const newText = block.text.split(patch.before).join(patch.after);
      await patchNotionBlockText(wiki.accessToken, block.id, block.type, newText);
      return;
    }
  }

  const pattern = buildFlexiblePattern(patch.before);
  if (pattern) {
    for (const block of blocks) {
      if (pattern.test(block.text)) {
        const newText = block.text.replace(pattern, patch.after);
        await patchNotionBlockText(wiki.accessToken, block.id, block.type, newText);
        return;
      }
    }
  }

  throw new Error(
    'Couldn\'t locate the exact text to replace in Notion. Use "Edit first" instead.',
  );
}
