import type { AssembledContext } from "../context/assembler.js";
import { formatContextForPrompt } from "../context/assembler.js";
import {
  getAnthropicClient,
  getAnthropicModelName,
  parseJsonResponse,
} from "./index.js";
import type { AnswerResult } from "./types.js";

function buildPrompt(context: AssembledContext): string {
  const { wikiSection, slackSection, wikiDate, slackDate } =
    formatContextForPrompt(context);

  return `You are a knowledge assistant. A user asked: "${context.question}"

You have two sources on the topic of ${context.question}:

WIKI DOC (last updated ${wikiDate}):
${wikiSection}

SLACK THREADS (most recent: ${slackDate}):
${slackSection}

First, determine if the sources are:
a) Consistent — answer the question, cite both sources
b) Contradictory — do not answer, return conflict mode
c) Additive — answer using both, note what Slack adds beyond the wiki
d) Insufficient — say you don't have enough information

Rules:
- Only use information from the sources above. Do not invent facts.
- For contradictory sources, set mode to "conflict" and do not provide a full answer.
- For additive sources, set mode to "answer" and mention what Slack adds in the answer.
- If the user asks what sources, documents, or channels you have access to, set mode to "answer" and list the wiki doc titles/URLs and Slack thread channels/URLs from the provided sources. Do not say the sources lack this information.
- wiki_source and slack_source must use titles/channels and URLs/dates from the provided sources.
- wiki_excerpt and slack_excerpt must be direct quotes from the sources.
- conflict_summary is required when mode is "conflict".

Return JSON only:
{
  "mode": "answer | conflict | insufficient",
  "answer": "answer text if mode is answer",
  "wiki_excerpt": "relevant wiki quote",
  "slack_excerpt": "relevant slack quote",
  "wiki_source": { "title": "", "url": "", "date": "" },
  "slack_source": { "channel": "", "date": "", "url": "" },
  "conflict_summary": "one sentence if mode is conflict"
}`;
}

function normalizeResult(raw: AnswerResult): AnswerResult {
  const mode = raw.mode ?? "insufficient";

  if (mode !== "answer" && mode !== "conflict" && mode !== "insufficient") {
    return { mode: "insufficient", answer: "I couldn't determine an answer." };
  }

  return {
    mode,
    answer: raw.answer?.trim(),
    wiki_excerpt: raw.wiki_excerpt?.trim(),
    slack_excerpt: raw.slack_excerpt?.trim(),
    wiki_source: raw.wiki_source,
    slack_source: raw.slack_source,
    conflict_summary: raw.conflict_summary?.trim(),
  };
}

export async function answerAndDetectConflict(
  context: AssembledContext,
): Promise<AnswerResult> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: getAnthropicModelName(),
    max_tokens: 2048,
    temperature: 0.2,
    messages: [
      {
        role: "user",
        content: buildPrompt(context),
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const text = textBlock?.type === "text" ? textBlock.text : "";

  if (!text) {
    throw new Error("Claude returned an empty response");
  }

  return normalizeResult(parseJsonResponse<AnswerResult>(text));
}
