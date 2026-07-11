import type { WikiConnection } from "../config/workspace.js";
import { buildExcerpt } from "../utils/formatter.js";
import type { DocChunk, DocUpdatePatch, WikiSearchOptions } from "./types.js";

interface DriveFile {
  id: string;
  name?: string;
  modifiedTime?: string;
  webViewLink?: string;
  mimeType?: string;
  lastModifyingUser?: { displayName?: string; emailAddress?: string };
}

interface DriveListResponse {
  files?: DriveFile[];
}

async function driveRequest<T>(
  accessToken: string,
  path: string,
): Promise<T> {
  const response = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Drive API error: ${body}`);
  }

  return (await response.json()) as T;
}

async function exportGoogleDocText(
  accessToken: string,
  fileId: string,
  mimeType?: string,
): Promise<string> {
  if (mimeType === "application/vnd.google-apps.document") {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      return "";
    }

    return response.text();
  }

  if (mimeType === "text/plain" || mimeType === "text/markdown") {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      return "";
    }

    return response.text();
  }

  return "";
}

export async function searchDriveDocs(
  wiki: WikiConnection,
  options: WikiSearchOptions,
): Promise<DocChunk[]> {
  const limit = options.limit ?? 5;
  const escapedQuery = options.query.replace(/'/g, "\\'");
  const query = encodeURIComponent(
    `fullText contains '${escapedQuery}' and trashed = false and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'text/plain' or mimeType = 'text/markdown')`,
  );

  const listResponse = await driveRequest<DriveListResponse>(
    wiki.accessToken,
    `/files?q=${query}&pageSize=${Math.min(limit * 2, 20)}&fields=files(id,name,modifiedTime,webViewLink,mimeType,lastModifyingUser)&orderBy=modifiedTime desc`,
  );

  const chunks: DocChunk[] = [];

  for (const file of (listResponse.files ?? []).slice(0, limit)) {
    const content = await exportGoogleDocText(
      wiki.accessToken,
      file.id,
      file.mimeType,
    );

    const title = file.name ?? "Untitled";

    chunks.push({
      title,
      content,
      excerpt: buildExcerpt(content || title, options.query),
      url: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`,
      date: file.modifiedTime ?? new Date().toISOString(),
      docId: file.id,
      provider: "drive",
      authorName: file.lastModifyingUser?.displayName,
      authorEmail: file.lastModifyingUser?.emailAddress,
    });
  }

  return chunks;
}

interface GoogleDocsReplaceReply {
  replaceAllText?: {
    occurrencesChanged?: number;
  };
}

export async function updateDriveDoc(
  wiki: WikiConnection,
  docId: string,
  patch: DocUpdatePatch,
): Promise<void> {
  const response = await fetch(
    `https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${wiki.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            replaceAllText: {
              containsText: { text: patch.before, matchCase: true },
              replaceText: patch.after,
            },
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Docs API error: ${body}`);
  }

  const result = (await response.json()) as { replies?: GoogleDocsReplaceReply[] };
  const occurrences = result.replies?.[0]?.replaceAllText?.occurrencesChanged ?? 0;

  if (occurrences === 0) {
    throw new Error(
      'Couldn\'t locate the exact text to replace in the doc. Use "Edit first" instead.',
    );
  }
}
