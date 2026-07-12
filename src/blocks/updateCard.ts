import type { Block, KnownBlock } from "@slack/types";
import type { WikiProvider } from "../config/workspace.js";
import { providerLabel } from "../utils/formatter.js";

export const UPDATE_DRAFT_COLOR = "#ECB22E";
export const UPDATE_SUCCESS_COLOR = "#2EB67D";
export const UPDATE_DISCARDED_COLOR = "#8D8D8D";

export interface UpdateCardInput {
  docTitle: string;
  before: string;
  after: string;
  reason: string;
  slackChannel?: string;
  slackUrl?: string;
  wikiUrl: string;
  draftId: string;
}

export function updateCardBlocks(input: UpdateCardInput): (Block | KnownBlock)[] {
  const sourceLine = input.slackChannel
    ? `Source: #${input.slackChannel}${input.slackUrl ? ` · <${input.slackUrl}|View thread>` : ""}`
    : undefined;

  const blocks: (Block | KnownBlock)[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "📝 Here's a draft update", emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `I've rewritten the relevant section of *${input.docTitle}* based on the Slack discussion.\n_${input.reason}_`,
      },
    },
    { type: "divider" },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `❌ *BEFORE*\n>${input.before.replace(/\n/g, "\n>")}`,
        },
        {
          type: "mrkdwn",
          text: `✅ *AFTER*\n>${input.after.replace(/\n/g, "\n>")}`,
        },
      ],
    },
    { type: "divider" },
  ];

  if (sourceLine) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: sourceLine }],
    });
  }

  return blocks;
}

/**
 * Buttons must live outside the colored attachment — Slack collapses long
 * attachment content behind a "Show more" toggle, which would hide the
 * actions along with everything else if they were bundled together.
 */
export function updateCardActions(input: UpdateCardInput): (Block | KnownBlock)[] {
  return [
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "✅ Approve & update doc" },
          action_id: "doc_update_approve",
          style: "primary",
          value: input.draftId,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "✏️ Edit first" },
          url: input.wikiUrl,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "✗ Discard" },
          action_id: "doc_update_discard",
          style: "danger",
          value: input.draftId,
        },
      ],
    },
  ];
}

export function updateSuccessBlocks(
  docTitle: string,
  provider: WikiProvider,
): (Block | KnownBlock)[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `✅ *Doc updated*\n\n${docTitle} has been updated in ${providerLabel(provider)}.`,
      },
    },
  ];
}

export function updateSuccessActions(url: string): (Block | KnownBlock)[] {
  return [
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View updated doc →" },
          url,
        },
      ],
    },
  ];
}

export function updateDiscardedBlocks(): (Block | KnownBlock)[] {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: "✗ Discarded. No changes were made." },
    },
  ];
}
