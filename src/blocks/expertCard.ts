import type { Block, KnownBlock } from "@slack/types";

export interface ExpertEntry {
  candidate: {
    id: string;
    slackUserId?: string;
    displayName: string;
  };
  reason: string;
  signal: "slack" | "wiki" | "both";
}

export function expertCardBlocks(
  topic: string,
  experts: ExpertEntry[],
): (Block | KnownBlock)[] {
  const blocks: (Block | KnownBlock)[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `🧠 Experts on ${topic}`, emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Based on Slack activity and wiki authorship in your watched channels:",
      },
    },
  ];

  for (const expert of experts) {
    blocks.push({ type: "divider" });

    const nameLine = expert.candidate.slackUserId
      ? `👤 *<@${expert.candidate.slackUserId}>*`
      : `👤 *${expert.candidate.displayName}*`;

    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `${nameLine}\n${expert.reason}` },
    });

    if (expert.candidate.slackUserId) {
      const firstName = expert.candidate.displayName.split(" ")[0] || "them";
      blocks.push({
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: `Message ${firstName} →` },
            action_id: "expertise_message_user",
            value: expert.candidate.slackUserId,
          },
        ],
      });
    }
  }

  return blocks;
}
