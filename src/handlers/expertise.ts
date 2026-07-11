import type { App, SayFn } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { expertCardBlocks } from "../blocks/expertCard.js";
import type { ExpertCandidateInput } from "../claude/expertise.js";
import { rankExperts } from "../claude/expertise.js";
import type { WorkspaceConfig } from "../config/workspace.js";
import { searchWikiDocs } from "../mcp/index.js";
import { aggregateSlackActivity } from "../rts/activity.js";

interface ExpertCandidate extends ExpertCandidateInput {
  slackUserId?: string;
}

const emailLookupCache = new Map<string, string | null>();

async function lookupSlackUserByEmail(
  client: WebClient,
  email: string,
): Promise<string | null> {
  const cached = emailLookupCache.get(email);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const result = await client.users.lookupByEmail({ email });
    const id = result.user?.id ?? null;
    emailLookupCache.set(email, id);
    return id;
  } catch {
    emailLookupCache.set(email, null);
    return null;
  }
}

export async function handleExpertiseQuery(
  topic: string,
  config: WorkspaceConfig | null,
  slackToken: string,
  client: WebClient,
  say: SayFn,
  actionToken?: string,
  contextChannelId?: string,
  threadTs?: string,
): Promise<void> {
  const watchedChannelIds = config?.watchedChannels ?? [];
  const wiki = config?.wiki;

  await say({
    text: `🧠 Looking for who knows about "${topic}"...`,
    thread_ts: threadTs,
  });

  const [activity, wikiChunks] = await Promise.all([
    aggregateSlackActivity({
      token: slackToken,
      query: topic,
      actionToken,
      watchedChannelIds,
      contextChannelId,
      limit: 20,
    }).catch(() => []),
    wiki
      ? searchWikiDocs(wiki, { query: topic, limit: 5 }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const candidates = new Map<string, ExpertCandidate>();

  for (const user of activity) {
    candidates.set(user.userId, {
      id: user.userId,
      slackUserId: user.userId,
      displayName: user.displayName ?? user.userId,
      messageCount: user.messageCount,
      mostRecentSlackDate: user.mostRecentDate,
      sampleMessages: user.samples.map((sample) => ({
        channelName: sample.channelName,
        date: sample.date,
        excerpt: sample.excerpt,
      })),
      wikiDocs: [],
    });
  }

  const wikiOnlyIdsByName = new Map<string, string>();
  let wikiOnlyCount = 0;

  for (const chunk of wikiChunks) {
    if (!chunk.authorName && !chunk.authorEmail) {
      continue;
    }

    let matchedId = chunk.authorEmail
      ? await lookupSlackUserByEmail(client, chunk.authorEmail)
      : null;

    if (matchedId && !candidates.has(matchedId)) {
      candidates.set(matchedId, {
        id: matchedId,
        slackUserId: matchedId,
        displayName: chunk.authorName ?? matchedId,
        messageCount: 0,
        sampleMessages: [],
        wikiDocs: [],
      });
    }

    if (!matchedId) {
      const nameKey = (chunk.authorName ?? "unknown author").trim().toLowerCase();
      const existingId = wikiOnlyIdsByName.get(nameKey);

      if (existingId) {
        matchedId = existingId;
      } else {
        wikiOnlyCount += 1;
        const wikiOnlyId = `wiki-${wikiOnlyCount}`;
        wikiOnlyIdsByName.set(nameKey, wikiOnlyId);
        candidates.set(wikiOnlyId, {
          id: wikiOnlyId,
          displayName: chunk.authorName ?? "Unknown author",
          messageCount: 0,
          sampleMessages: [],
          wikiDocs: [],
        });
        matchedId = wikiOnlyId;
      }
    }

    candidates.get(matchedId)?.wikiDocs.push({ title: chunk.title, date: chunk.date });
  }

  const candidateList = [...candidates.values()].slice(0, 8);

  if (candidateList.length === 0) {
    await say({
      text: `I couldn't find anyone talking about "${topic}" in your watched channels or wiki.`,
      thread_ts: threadTs,
    });
    return;
  }

  try {
    const ranked = await rankExperts(topic, candidateList);

    const experts = ranked
      .map((entry) => {
        const candidate = candidateList.find((item) => item.id === entry.user_id);
        return candidate
          ? { candidate, reason: entry.reason, signal: entry.signal }
          : undefined;
      })
      .filter(
        (entry): entry is { candidate: ExpertCandidate; reason: string; signal: "slack" | "wiki" | "both" } =>
          Boolean(entry),
      );

    if (experts.length === 0) {
      await say({
        text: `I found some activity on "${topic}" but couldn't confidently rank experts.`,
        thread_ts: threadTs,
      });
      return;
    }

    await say({
      text: `🧠 Experts on ${topic}`,
      blocks: expertCardBlocks(topic, experts),
      thread_ts: threadTs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Claude error";
    await say({ text: `Couldn't rank experts: ${message}`, thread_ts: threadTs });
  }
}

export function registerExpertiseHandlers(app: App): void {
  app.action("expertise_message_user", async ({ ack, body, client }) => {
    await ack();

    const requesterId = body.user.id;
    const action = "actions" in body ? body.actions?.[0] : undefined;
    const targetUserId = action && "value" in action ? action.value : undefined;
    const fallbackChannel =
      "channel" in body && body.channel?.id ? body.channel.id : requesterId;

    if (!targetUserId) {
      return;
    }

    try {
      const dm = await client.conversations.open({ users: targetUserId });
      const dmChannelId = dm.channel?.id;

      if (dmChannelId) {
        await client.chat.postMessage({
          channel: dmChannelId,
          text: `👋 Hey! <@${requesterId}> asked @knowledge about a topic and it looks like you might be the right person to help. Do you have 5 mins?`,
        });
      }

      await client.chat.postEphemeral({
        channel: fallbackChannel,
        user: requesterId,
        text: `✅ Sent <@${targetUserId}> a heads up — they'll follow up with you.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await client.chat.postEphemeral({
        channel: fallbackChannel,
        user: requesterId,
        text: `Couldn't reach that person: ${message}`,
      });
    }
  });
}
