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

  const sources: string[] = [];
  let footer = "This answer is based on the sources below.";

  if (result.wiki_source?.title) {
    const link = result.wiki_source.url
      ? `<${result.wiki_source.url}|${result.wiki_source.title}>`
      : result.wiki_source.title;
    sources.push(
      `📄 ${link} — updated ${formatDisplayDate(result.wiki_source.date)}`,
    );
  }

  if (result.slack_source?.channel) {
    const link = result.slack_source.url
      ? `<${result.slack_source.url}|#${result.slack_source.channel}>`
      : `#${result.slack_source.channel}`;
    sources.push(
      `💬 ${link} — ${formatDisplayDate(result.slack_source.date)}`,
    );
  }

  if (sources.length > 0) {
    if (sources.length >= 2) {
      footer = "Both sources look consistent. ✅";
    }

    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: ["*Sources*", ...sources, "", footer].join("\n"),
      },
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
        text:
          result.answer ??
          "I don't have enough information in your wiki or Slack history to answer that.",
      },
    },
  ];
}
