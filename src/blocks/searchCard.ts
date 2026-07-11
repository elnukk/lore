import type { Block, KnownBlock } from "@slack/types";
import type { ThreadChunk } from "../rts/search.js";

export function slackSearchResultBlocks(
  chunks: ThreadChunk[],
): (Block | KnownBlock)[] {
  if (chunks.length === 0) {
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "🔍 No relevant Slack threads found in your watched channels.",
        },
      },
    ];
  }

  const blocks: (Block | KnownBlock)[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🔍 *Found ${chunks.length} relevant Slack thread${chunks.length === 1 ? "" : "s"}*`,
      },
    },
    { type: "divider" },
  ];

  for (const chunk of chunks) {
    const date = new Date(chunk.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    const excerpt =
      chunk.content.length > 300
        ? `${chunk.content.slice(0, 297)}...`
        : chunk.content;

    const link = chunk.permalink
      ? `\n<${chunk.permalink}|View thread>`
      : "";

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*#${chunk.channelName}* · ${date}${link}\n>${excerpt.replace(/\n/g, "\n>")}`,
      },
    });
  }

  return blocks;
}
