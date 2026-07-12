import type { App, SayFn } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import type { Block, KnownBlock } from "@slack/types";
import { assembleContext } from "../context/assembler.js";
import {
  answerCardBlocks,
  answerCardColor,
  INSUFFICIENT_CARD_COLOR,
  insufficientCardBlocks,
} from "../blocks/answerCard.js";
import {
  CONFLICT_CARD_COLOR,
  conflictCardActions,
  conflictCardBlocks,
} from "../blocks/conflictCard.js";
import { sourcesInventoryBlocks } from "../blocks/sourcesCard.js";
import { answerAndDetectConflict } from "../claude/answer.js";
import { getWorkspace } from "../config/workspace.js";
import { ensureFreshWiki } from "../config/wikiToken.js";
import { createPendingConflict } from "../context/pendingUpdates.js";
import { handleExpertiseQuery } from "./expertise.js";
import { handleUpdateInstruction } from "./update.js";
import { listWikiDocs, searchWikiDocs } from "../mcp/index.js";
import type { ThreadChunk } from "../rts/search.js";
import { searchSlackThreads } from "../rts/search.js";
import { resolveChannelNames } from "../utils/channels.js";
import {
  extractExpertiseTopic,
  extractKeywords,
  isExpertiseQuery,
  isSourceInventoryQuery,
  isUpdateInstructionQuery,
} from "../utils/keywords.js";
import { providerLabel } from "../utils/formatter.js";

interface EventWithActionToken {
  action_token?: string;
  channel?: string;
}

function formatThreadForDraft(chunk: ThreadChunk): string {
  const before = chunk.contextBefore.map((message) => message.text).filter(Boolean);
  const after = chunk.contextAfter.map((message) => message.text).filter(Boolean);
  return [...before, chunk.content, ...after].join("\n");
}

async function handleQuestion(
  text: string,
  teamId: string | undefined,
  actionToken: string | undefined,
  contextChannelId: string | undefined,
  say: SayFn,
  client: WebClient,
  threadTs?: string,
): Promise<void> {
  const query = extractKeywords(text);

  if (!query) {
    await say({
      text: "Ask me a question and I'll search your wiki and Slack history.",
      thread_ts: threadTs,
    });
    return;
  }

  const slackToken = process.env.SLACK_BOT_TOKEN;
  if (!slackToken) {
    await say({ text: "Bot token is not configured.", thread_ts: threadTs });
    return;
  }

  const config = teamId ? await getWorkspace(teamId) : null;
  const watchedChannelIds = config?.watchedChannels ?? [];
  const wiki = config ? await ensureFreshWiki(config) : undefined;

  if (isExpertiseQuery(query)) {
    await handleExpertiseQuery(
      extractExpertiseTopic(query),
      config,
      slackToken,
      client,
      say,
      actionToken,
      contextChannelId,
      threadTs,
    );
    return;
  }

  if (isUpdateInstructionQuery(query)) {
    await handleUpdateInstruction(
      query,
      teamId,
      config,
      client,
      say,
      contextChannelId,
      threadTs,
    );
    return;
  }

  const inventoryQuery = isSourceInventoryQuery(query);

  if (inventoryQuery) {
    const [wikiResult, channelNames] = await Promise.all([
      wiki ? listWikiDocs(wiki, 20) : Promise.resolve([]),
      watchedChannelIds.length > 0
        ? resolveChannelNames(client, watchedChannelIds)
        : Promise.resolve([]),
    ]);

    const blocks = sourcesInventoryBlocks({
      wikiProvider: wiki?.provider,
      wikiWorkspaceName: wiki?.workspaceName,
      wikiChunks: wikiResult,
      slackChannels: channelNames,
    });

    const wikiCount = wikiResult.length;
    const channelCount = channelNames.length;

    await say({
      text: `I have access to ${wikiCount} wiki doc${wikiCount === 1 ? "" : "s"} and ${channelCount} Slack channel${channelCount === 1 ? "" : "s"}.`,
      blocks,
      thread_ts: threadTs,
    });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    await say({
      text: "ANTHROPIC_API_KEY is not configured. Add it to your `.env` file.",
      thread_ts: threadTs,
    });
    return;
  }

  const [slackResult, wikiResult] = await Promise.allSettled([
    searchSlackThreads({
      token: slackToken,
      query,
      actionToken,
      watchedChannelIds,
      contextChannelId,
      limit: 5,
    }),
    wiki
      ? searchWikiDocs(wiki, { query, limit: 5 })
      : Promise.resolve([]),
  ]);

  const slackChunks =
    slackResult.status === "fulfilled" ? slackResult.value : [];
  const wikiChunks =
    wikiResult.status === "fulfilled" ? wikiResult.value : [];

  const errors: string[] = [];

  if (wikiResult.status === "rejected" && wiki) {
    errors.push(
      `${providerLabel(wiki.provider)} search failed: ${wikiResult.reason instanceof Error ? wikiResult.reason.message : "Unknown error"}`,
    );
  }

  if (slackResult.status === "rejected") {
    const message =
      slackResult.reason instanceof Error
        ? slackResult.reason.message
        : "Unknown search error";

    if (message === "invalid_action_token" || message === "missing_scope") {
      errors.push(
        `Slack search failed: \`${message}\`. Check RTS scopes and reinstall the app.`,
      );
    } else if (message === "feature_not_enabled" || message === "access_denied") {
      errors.push("Slack Real-Time Search isn't enabled for this workspace.");
    } else {
      errors.push(`Slack search failed: ${message}`);
    }
  }

  if (wikiChunks.length === 0 && slackChunks.length === 0) {
    await say({
      text: [
        "I couldn't find anything in your wiki or Slack history for that question.",
        ...errors,
      ].join("\n"),
      thread_ts: threadTs,
    });
    return;
  }

  const context = assembleContext(query, wikiChunks, slackChunks);

  try {
    const result = await answerAndDetectConflict(context);
    let blocks: (Block | KnownBlock)[];
    let actionBlocks: (Block | KnownBlock)[] = [];
    let color: string;
    let text: string;

    if (result.mode === "conflict") {
      const matchedWikiChunk =
        wikiChunks.find((chunk) => chunk.url === result.wiki_source?.url) ??
        wikiChunks[0];
      const matchedSlackChunk =
        slackChunks.find(
          (chunk) => chunk.permalink === result.slack_source?.url,
        ) ?? slackChunks[0];

      const updateId =
        wiki && matchedWikiChunk && matchedSlackChunk
          ? createPendingConflict({
              teamId: teamId ?? "",
              question: query,
              wiki: {
                provider: matchedWikiChunk.provider,
                docId: matchedWikiChunk.docId,
                title: matchedWikiChunk.title,
                url: matchedWikiChunk.url,
                content: matchedWikiChunk.content,
              },
              slack: {
                channel: matchedSlackChunk.channelName,
                url: matchedSlackChunk.permalink,
                content: formatThreadForDraft(matchedSlackChunk),
              },
            })
          : undefined;

      const conflictPayload = {
        teamId: teamId ?? "",
        question: query,
        wikiTitle: result.wiki_source?.title,
        wikiUrl: result.wiki_source?.url,
        wikiExcerpt: result.wiki_excerpt,
        slackChannel: result.slack_source?.channel,
        slackUrl: result.slack_source?.url,
        slackExcerpt: result.slack_excerpt,
        updateId,
      };

      blocks = conflictCardBlocks(result, conflictPayload);
      actionBlocks = conflictCardActions(result, conflictPayload);
      color = CONFLICT_CARD_COLOR;
      text = result.conflict_summary ?? "I found a conflict between your wiki and Slack.";
    } else if (result.mode === "insufficient") {
      blocks = insufficientCardBlocks(result);
      color = INSUFFICIENT_CARD_COLOR;
      text = result.answer ?? "I don't have enough information to answer that.";
    } else {
      blocks = answerCardBlocks(query, result);
      color = answerCardColor(result);
      text = result.answer ?? "Here's what I found.";
    }

    if (errors.length > 0) {
      blocks.push({ type: "divider" });
      blocks.push({
        type: "context",
        elements: errors.map((error) => ({
          type: "mrkdwn" as const,
          text: `⚠️ ${error}`,
        })),
      });
    }

    await say({
      text,
      blocks: actionBlocks,
      attachments: [{ color, blocks }],
      thread_ts: threadTs,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Claude error";

    await say({
      text: `I found source material but couldn't analyze it with Claude: ${message}`,
      thread_ts: threadTs,
    });
  }
}

export function registerQuestionHandlers(app: App): void {
  app.event("app_mention", async ({ event, say, body, client }) => {
    const text = event.text.replace(/<@[^>]+>/g, "").trim();
    const actionToken = (event as EventWithActionToken).action_token;

    await handleQuestion(
      text,
      body.team_id,
      actionToken,
      event.channel,
      say,
      client,
      event.thread_ts ?? event.ts,
    );
  });

  app.message(async ({ message, say, body, client }) => {
    if (message.subtype || !("text" in message) || !message.text) {
      return;
    }

    if ("bot_id" in message && message.bot_id) {
      return;
    }

    if (message.channel_type !== "im") {
      return;
    }

    const actionToken = (message as EventWithActionToken).action_token;

    await handleQuestion(
      message.text,
      body.team_id,
      actionToken,
      message.channel,
      say,
      client,
    );
  });
}
