export interface ContextMessage {
  text: string;
  userId?: string;
  ts?: string;
}

export interface ThreadChunk {
  content: string;
  channelId: string;
  channelName: string;
  messageTs: string;
  permalink: string;
  date: string;
  authorName?: string;
  authorUserId?: string;
  isAuthorBot?: boolean;
  contextBefore: ContextMessage[];
  contextAfter: ContextMessage[];
}

interface RtsContextMessage {
  text?: string;
  user_id?: string;
  ts?: string;
}

interface RtsMessageResult {
  author_name?: string;
  author_user_id?: string;
  channel_id?: string;
  channel_name?: string;
  message_ts?: string;
  content?: string;
  is_author_bot?: boolean;
  permalink?: string;
  context_messages?: {
    before?: RtsContextMessage[];
    after?: RtsContextMessage[];
  };
}

interface RtsSearchResponse {
  ok: boolean;
  error?: string;
  results?: {
    messages?: RtsMessageResult[];
  };
  response_metadata?: {
    next_cursor?: string;
  };
}

export interface SearchSlackOptions {
  token: string;
  query: string;
  actionToken?: string;
  watchedChannelIds?: string[];
  contextChannelId?: string;
  limit?: number;
}

function mapContextMessage(message: RtsContextMessage): ContextMessage {
  return {
    text: message.text ?? "",
    userId: message.user_id,
    ts: message.ts,
  };
}

function mapMessageResult(message: RtsMessageResult): ThreadChunk | null {
  if (!message.channel_id || !message.message_ts || !message.content) {
    return null;
  }

  const ts = Number.parseFloat(message.message_ts);
  const date = Number.isFinite(ts)
    ? new Date(ts * 1000).toISOString()
    : new Date().toISOString();

  return {
    content: message.content,
    channelId: message.channel_id,
    channelName: message.channel_name ?? message.channel_id,
    messageTs: message.message_ts,
    permalink: message.permalink ?? "",
    date,
    authorName: message.author_name,
    authorUserId: message.author_user_id,
    isAuthorBot: message.is_author_bot,
    contextBefore: (message.context_messages?.before ?? []).map(mapContextMessage),
    contextAfter: (message.context_messages?.after ?? []).map(mapContextMessage),
  };
}

function filterByWatchedChannels(
  chunks: ThreadChunk[],
  watchedChannelIds?: string[],
): ThreadChunk[] {
  if (!watchedChannelIds || watchedChannelIds.length === 0) {
    return chunks;
  }

  const allowed = new Set(watchedChannelIds);
  return chunks.filter((chunk) => allowed.has(chunk.channelId));
}

export async function searchSlackThreads(
  options: SearchSlackOptions,
): Promise<ThreadChunk[]> {
  const {
    token,
    query,
    actionToken,
    watchedChannelIds,
    contextChannelId,
    limit = 5,
  } = options;

  const fetchLimit = Math.min(Math.max(limit * 4, 10), 20);

  const body: Record<string, unknown> = {
    query,
    content_types: ["messages"],
    channel_types: ["public_channel", "private_channel"],
    include_context_messages: true,
    include_bots: false,
    limit: fetchLimit,
    sort: "score",
    sort_dir: "desc",
  };

  if (actionToken) {
    body.action_token = actionToken;
  }

  if (contextChannelId) {
    body.context_channel_id = contextChannelId;
  }

  const response = await fetch("https://slack.com/api/assistant.search.context", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as RtsSearchResponse;

  if (!data.ok) {
    throw new Error(data.error ?? "assistant.search.context failed");
  }

  const chunks = (data.results?.messages ?? [])
    .map(mapMessageResult)
    .filter((chunk): chunk is ThreadChunk => chunk !== null);

  return filterByWatchedChannels(chunks, watchedChannelIds).slice(0, limit);
}

export function formatThreadChunksForSlack(chunks: ThreadChunk[]): string {
  if (chunks.length === 0) {
    return "No relevant Slack threads found in your watched channels.";
  }

  const lines = chunks.map((chunk, index) => {
    const date = new Date(chunk.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    const excerpt =
      chunk.content.length > 220
        ? `${chunk.content.slice(0, 217)}...`
        : chunk.content;

    const link = chunk.permalink ? `<${chunk.permalink}|View thread>` : "";

    return [
      `*${index + 1}. #${chunk.channelName}* — ${date}`,
      excerpt,
      link,
    ]
      .filter(Boolean)
      .join("\n");
  });

  return ["*Relevant Slack threads*", "", ...lines].join("\n");
}
