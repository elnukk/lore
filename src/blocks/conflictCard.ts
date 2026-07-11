import type { Block, KnownBlock } from "@slack/types";
import type { AnswerResult } from "../claude/types.js";

function formatDisplayDate(date?: string): string {
  if (!date) {
    return "unknown date";
  }

  const parsed = Date.parse(date);
  if (Number.isNaN(parsed)) {
    return date;
  }

  return new Date(parsed).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export interface ConflictActionPayload {
  teamId: string;
  question: string;
  wikiTitle?: string;
  wikiUrl?: string;
  wikiExcerpt?: string;
  slackChannel?: string;
  slackUrl?: string;
  slackExcerpt?: string;
  updateId?: string;
}

export function conflictCardBlocks(
  result: AnswerResult,
  actionPayload: ConflictActionPayload,
): (Block | KnownBlock)[] {
  const wikiDate = formatDisplayDate(result.wiki_source?.date);
  const slackDate = formatDisplayDate(result.slack_source?.date);
  const wikiQuote = result.wiki_excerpt ?? "No wiki excerpt available.";
  const slackQuote = result.slack_excerpt ?? "No Slack excerpt available.";

  const blocks: (Block | KnownBlock)[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "⚠️ I found a conflict", emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          result.conflict_summary ??
          "Your wiki and a recent Slack thread disagree on this topic.",
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `📄 *Wiki says* (updated ${wikiDate}):\n>"${wikiQuote.replace(/\n/g, "\n>")}"`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `💬 *#${result.slack_source?.channel ?? "slack"} says* (${slackDate}):\n>"${slackQuote.replace(/\n/g, "\n>")}"`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "The Slack thread is likely more current.",
      },
    },
  ];

  const actionElements: Array<{
    type: "button";
    text: { type: "plain_text"; text: string };
    url?: string;
    action_id?: string;
    value?: string;
    style?: "primary";
  }> = [];

  if (result.slack_source?.url) {
    actionElements.push({
      type: "button",
      text: { type: "plain_text", text: "See full thread" },
      url: result.slack_source.url,
    });
  }

  if (actionPayload.updateId) {
    actionElements.push({
      type: "button",
      text: { type: "plain_text", text: "Update the doc →" },
      action_id: "conflict_update_doc",
      style: "primary",
      value: JSON.stringify({ updateId: actionPayload.updateId }).slice(0, 2000),
    });
  }

  blocks.push({
    type: "actions",
    elements: actionElements,
  });

  return blocks;
}
