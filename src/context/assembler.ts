import type { DocChunk } from "../mcp/types.js";
import type { ThreadChunk } from "../rts/search.js";

export interface AssembledContext {
  question: string;
  wikiChunks: DocChunk[];
  slackChunks: ThreadChunk[];
  wikiLatestDate?: string;
  slackLatestDate?: string;
}

function latestDate(dates: string[]): string | undefined {
  if (dates.length === 0) {
    return undefined;
  }

  return dates.sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}

function formatWikiChunks(chunks: DocChunk[]): string {
  if (chunks.length === 0) {
    return "No wiki documents found.";
  }

  return chunks
    .map(
      (chunk, index) =>
        `[Doc ${index + 1}] ${chunk.title} (updated ${chunk.date})\nURL: ${chunk.url}\n${chunk.content || chunk.excerpt}`,
    )
    .join("\n\n---\n\n");
}

function formatSlackChunks(chunks: ThreadChunk[]): string {
  if (chunks.length === 0) {
    return "No Slack threads found.";
  }

  return chunks
    .map(
      (chunk, index) =>
        `[Thread ${index + 1}] #${chunk.channelName} (${chunk.date})\nURL: ${chunk.permalink}\nAuthor: ${chunk.authorName ?? "unknown"}\n${chunk.content}`,
    )
    .join("\n\n---\n\n");
}

export function assembleContext(
  question: string,
  wikiChunks: DocChunk[],
  slackChunks: ThreadChunk[],
): AssembledContext {
  return {
    question,
    wikiChunks,
    slackChunks,
    wikiLatestDate: latestDate(wikiChunks.map((chunk) => chunk.date)),
    slackLatestDate: latestDate(slackChunks.map((chunk) => chunk.date)),
  };
}

export function formatContextForPrompt(context: AssembledContext): {
  wikiSection: string;
  slackSection: string;
  wikiDate: string;
  slackDate: string;
} {
  return {
    wikiSection: formatWikiChunks(context.wikiChunks),
    slackSection: formatSlackChunks(context.slackChunks),
    wikiDate: context.wikiLatestDate ?? "unknown",
    slackDate: context.slackLatestDate ?? "unknown",
  };
}
