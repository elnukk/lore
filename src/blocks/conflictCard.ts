import type { Block, KnownBlock } from "@slack/types";
import type { AnswerResult } from "../claude/types.js";
import { isRealValue } from "../utils/formatter.js";

function formatDisplayDate(date?: string): string {
  if (!isRealValue(date)) {
    return "unknown date";
  }

  const parsed = Date.parse(date);
  if (Number.isNaN(parsed)) {
    return "unknown date";
  }

  return new Date(parsed).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export const CONFLICT_CARD_COLOR = "#E01E5A";

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

  return [
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
    { type: "divider" },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `📄 *Wiki says*\n_updated ${wikiDate}_\n>${wikiQuote.replace(/\n/g, "\n>")}`,
        },
        {
          type: "mrkdwn",
          text: `💬 *#${isRealValue(result.slack_source?.channel) ? result.slack_source?.channel : "slack"} says*\n_${slackDate}_\n>${slackQuote.replace(/\n/g, "\n>")}`,
        },
      ],
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: "🕑 The Slack thread is likely more current." }],
    },
  ];
}

/**
 * Buttons must live outside the colored attachment — Slack collapses long
 * attachment content behind a "Show more" toggle, which would hide the
 * actions along with everything else if they were bundled together.
 */
export function conflictCardActions(
  result: AnswerResult,
  actionPayload: ConflictActionPayload,
): (Block | KnownBlock)[] {
  const actionElements: Array<{
    type: "button";
    text: { type: "plain_text"; text: string };
    url?: string;
    action_id?: string;
    value?: string;
    style?: "primary";
  }> = [];

  if (isRealValue(result.slack_source?.url)) {
    actionElements.push({
      type: "button",
      text: { type: "plain_text", text: "See full thread" },
      url: result.slack_source?.url as string,
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

  return actionElements.length > 0
    ? [{ type: "actions", elements: actionElements }]
    : [];
}
