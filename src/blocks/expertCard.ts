import type { Block, KnownBlock } from "@slack/types";

export const EXPERT_CARD_COLOR = "#4A154B";

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

const SIGNAL_LABELS: Record<ExpertEntry["signal"], string> = {
  slack: "💬 Slack activity",
  wiki: "📄 Wiki authorship",
  both: "💬📄 Slack activity + wiki authorship",
};

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

  experts.forEach((expert, index) => {
    blocks.push({ type: "divider" });

    const medal = RANK_MEDALS[index] ?? "👤";
    const nameLine = expert.candidate.slackUserId
      ? `${medal} *<@${expert.candidate.slackUserId}>*`
      : `${medal} *${expert.candidate.displayName}*`;

    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `${nameLine}\n${expert.reason}` },
    });

    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: SIGNAL_LABELS[expert.signal] ?? "📄💬 Combined signal" }],
    });
  });

  return blocks;
}

/**
 * Buttons must live outside the colored attachment — Slack collapses long
 * attachment content behind a "Show more" toggle, which would hide the
 * actions along with everything else if they were bundled together. All
 * "Message X" buttons are combined into one row rather than interleaved
 * per-expert, since they can no longer sit directly under each entry.
 */
export function expertCardActions(experts: ExpertEntry[]): (Block | KnownBlock)[] {
  const elements = experts
    .filter((expert) => expert.candidate.slackUserId)
    .map((expert) => {
      const firstName = expert.candidate.displayName.split(" ")[0] || "them";
      return {
        type: "button" as const,
        text: { type: "plain_text" as const, text: `Message ${firstName} →` },
        action_id: "expertise_message_user",
        value: expert.candidate.slackUserId as string,
      };
    });

  return elements.length > 0 ? [{ type: "actions", elements }] : [];
}
