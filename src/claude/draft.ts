import {
  getAnthropicClient,
  getAnthropicModelName,
  parseJsonResponse,
} from "./index.js";

export interface DraftUpdateInput {
  docTitle: string;
  fullDoc: string;
  threadContent: string;
}

export interface DraftUpdateResult {
  before: string;
  after: string;
  reason: string;
}

function buildPrompt({ docTitle, fullDoc, threadContent }: DraftUpdateInput): string {
  return `You are a technical writer. Here is a wiki doc titled "${docTitle}":
${fullDoc}

Here is a Slack thread with newer information:
${threadContent}

Rewrite only the sections that need updating based on the Slack thread. Match the existing doc's tone and formatting exactly. Be minimal — only change what the thread contradicts or adds.

Rules:
- "before" must be copied verbatim from the doc above, character-for-character, so it can be located and replaced automatically. Do not paraphrase it.
- Keep "before" as short as possible while still being the full contradicted/outdated statement — ideally a single sentence or short passage, not the whole doc.
- "after" should read naturally in place of "before", matching the doc's tone.

Return JSON only:
{
  "before": "exact original text being replaced",
  "after": "updated replacement text",
  "reason": "one sentence explanation"
}`;
}

export async function draftDocUpdate(
  input: DraftUpdateInput,
): Promise<DraftUpdateResult> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: getAnthropicModelName(),
    max_tokens: 1024,
    temperature: 0.2,
    messages: [{ role: "user", content: buildPrompt(input) }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const text = textBlock?.type === "text" ? textBlock.text : "";

  if (!text) {
    throw new Error("Claude returned an empty response");
  }

  const raw = parseJsonResponse<Partial<DraftUpdateResult>>(text);

  if (!raw.before?.trim() || !raw.after?.trim()) {
    throw new Error("Claude did not return a usable before/after diff");
  }

  return {
    before: raw.before.trim(),
    after: raw.after.trim(),
    reason: raw.reason?.trim() ?? "Updated based on recent Slack discussion.",
  };
}
