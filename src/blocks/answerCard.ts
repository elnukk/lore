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

export const ANSWER_CARD_COLOR_CONSISTENT = "#2EB67D";
export const ANSWER_CARD_COLOR_SINGLE_SOURCE = "#36C5F0";
export const INSUFFICIENT_CARD_COLOR = "#8D8D8D";

export function answerCardColor(result: AnswerResult): string {
  const sourceCount =
    (isRealValue(result.wiki_source?.title) ? 1 : 0) +
    (isRealValue(result.slack_source?.channel) ? 1 : 0);
  return sourceCount >= 2 ? ANSWER_CARD_COLOR_CONSISTENT : ANSWER_CARD_COLOR_SINGLE_SOURCE;
}

export function answerCardBlocks(
  question: string,
  result: AnswerResult,
): (Block | KnownBlock)[] {
  const title = question.length > 80 ? `${question.slice(0, 77)}...` : question;

  const blocks: (Block | KnownBlock)[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `📖 ${title}`, emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: result.answer ?? "I couldn't find a clear answer.",
      },
    },
  ];

  const sourceFields: { type: "mrkdwn"; text: string }[] = [];

  if (isRealValue(result.wiki_source?.title)) {
    const link = isRealValue(result.wiki_source?.url)
      ? `<${result.wiki_source?.url}|${result.wiki_source?.title}>`
      : result.wiki_source?.title;
    sourceFields.push({
      type: "mrkdwn",
      text: `📄 *Wiki*\n${link}\n_updated ${formatDisplayDate(result.wiki_source?.date)}_`,
    });
  }

  if (isRealValue(result.slack_source?.channel)) {
    const link = isRealValue(result.slack_source?.url)
      ? `<${result.slack_source?.url}|#${result.slack_source?.channel}>`
      : `#${result.slack_source?.channel}`;
    sourceFields.push({
      type: "mrkdwn",
      text: `💬 *Slack*\n${link}\n_${formatDisplayDate(result.slack_source?.date)}_`,
    });
  }

  if (sourceFields.length > 0) {
    const footer =
      sourceFields.length >= 2
        ? "✅ Both sources look consistent."
        : "This answer is based on the source below.";

    blocks.push({ type: "divider" });
    blocks.push({ type: "section", fields: sourceFields });
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: footer }],
    });
  }

  return blocks;
}

export function insufficientCardBlocks(
  result: AnswerResult,
): (Block | KnownBlock)[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🤷 ${result.answer ?? "I don't have enough information in your wiki or Slack history to answer that."}`,
      },
    },
  ];
}
