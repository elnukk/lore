import {
  getAnthropicClient,
  getAnthropicModelName,
  parseJsonResponse,
} from "./index.js";

export interface ExpertCandidateInput {
  id: string;
  displayName: string;
  messageCount: number;
  mostRecentSlackDate?: string;
  sampleMessages: { channelName: string; date: string; excerpt: string }[];
  wikiDocs: { title: string; date: string }[];
}

export interface ExpertRankResult {
  user_id: string;
  reason: string;
  signal: "slack" | "wiki" | "both";
}

function buildPrompt(topic: string, candidates: ExpertCandidateInput[]): string {
  const lines = candidates
    .map((candidate) => {
      const slackPart =
        candidate.messageCount > 0
          ? `Slack activity: ${candidate.messageCount} message(s), most recent ${candidate.mostRecentSlackDate ?? "unknown"}.\nSamples:\n${candidate.sampleMessages
              .map((sample) => `  - [#${sample.channelName}, ${sample.date}] "${sample.excerpt}"`)
              .join("\n")}`
          : "Slack activity: none in watched channels.";

      const wikiPart =
        candidate.wikiDocs.length > 0
          ? `Wiki authorship: ${candidate.wikiDocs.map((doc) => `"${doc.title}" (last edited ${doc.date})`).join(", ")}`
          : "Wiki authorship: none found.";

      return `ID: ${candidate.id}\nName: ${candidate.displayName}\n${slackPart}\n${wikiPart}`;
    })
    .join("\n\n---\n\n");

  return `You are analyzing who knows most about "${topic}" based on the following Slack activity and wiki authorship data for each candidate.

${lines}

Rank the top 3 experts from the candidates above. For each, write one sentence explaining why they are the right person, citing specific evidence (a channel, doc title, or activity detail) from the data given. Do not invent details not present above. If fewer than 3 candidates have real evidence, return fewer.

Return JSON only:
{
  "experts": [
    { "user_id": "the ID field exactly as given above", "reason": "", "signal": "slack | wiki | both" }
  ]
}`;
}

export async function rankExperts(
  topic: string,
  candidates: ExpertCandidateInput[],
): Promise<ExpertRankResult[]> {
  if (candidates.length === 0) {
    return [];
  }

  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: getAnthropicModelName(),
    max_tokens: 1024,
    temperature: 0.2,
    messages: [{ role: "user", content: buildPrompt(topic, candidates) }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const text = textBlock?.type === "text" ? textBlock.text : "";

  if (!text) {
    throw new Error("Claude returned an empty response");
  }

  const raw = parseJsonResponse<{ experts?: Partial<ExpertRankResult>[] }>(text);
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));

  return (raw.experts ?? [])
    .filter(
      (expert): expert is ExpertRankResult =>
        Boolean(expert.user_id && expert.reason) && candidateIds.has(expert.user_id as string),
    )
    .slice(0, 3);
}
