import type { Block, KnownBlock } from "@slack/types";
import type { DocChunk } from "../mcp/types.js";
import { providerLabel } from "../utils/formatter.js";

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

export function sourcesInventoryBlocks(options: {
  wikiProvider?: string;
  wikiWorkspaceName?: string;
  wikiChunks: DocChunk[];
  slackChannels: string[];
}): (Block | KnownBlock)[] {
  const blocks: (Block | KnownBlock)[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "📚 Sources I can access",
        emoji: true,
      },
    },
  ];

  if (options.wikiProvider) {
    const providerName = providerLabel(options.wikiProvider);
    const workspace = options.wikiWorkspaceName
      ? ` (${options.wikiWorkspaceName})`
      : "";

    if (options.wikiChunks.length === 0) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `📄 *${providerName}${workspace}*\nNo pages are shared with the integration yet. Open a page in Notion → ⋯ → Connections → add the integration.`,
        },
      });
    } else {
      const wikiLines = options.wikiChunks.map((chunk) => {
        const link = chunk.url
          ? `<${chunk.url}|${chunk.title}>`
          : chunk.title;
        return `• ${link} — updated ${formatDisplayDate(chunk.date)}`;
      });

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: [`📄 *${providerName}${workspace}*`, ...wikiLines].join("\n"),
        },
      });
    }
  }

  if (options.slackChannels.length > 0) {
    const channelLines = options.slackChannels.map(
      (channel) => `• #${channel}`,
    );

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          "💬 *Slack channels I monitor*",
          ...channelLines,
        ].join("\n"),
      },
    });
  } else {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "💬 *Slack*\nNo channels configured yet. Complete onboarding to select channels.",
      },
    });
  }

  blocks.push({ type: "divider" });
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: "I search these sources when you ask questions. Wiki pages must be explicitly shared with the integration during Notion OAuth or via Connections.",
      },
    ],
  });

  return blocks;
}
