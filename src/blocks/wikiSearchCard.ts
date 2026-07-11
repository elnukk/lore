import type { Block, KnownBlock } from "@slack/types";
import type { DocChunk } from "../mcp/types.js";
import { providerLabel } from "../utils/formatter.js";

export function wikiSearchResultBlocks(
  chunks: DocChunk[],
  provider?: string,
): (Block | KnownBlock)[] {
  const providerName = provider ? providerLabel(provider) : "wiki";

  if (chunks.length === 0) {
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `📄 No relevant ${providerName} docs found.`,
        },
      },
    ];
  }

  const blocks: (Block | KnownBlock)[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `📄 *Found ${chunks.length} relevant ${providerName} doc${chunks.length === 1 ? "" : "s"}*`,
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

    const excerpt = chunk.excerpt || chunk.title;
    const link = chunk.url ? `\n<${chunk.url}|Open doc>` : "";

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${chunk.title}* · updated ${date}${link}\n>${excerpt.replace(/\n/g, "\n>")}`,
      },
    });
  }

  return blocks;
}
