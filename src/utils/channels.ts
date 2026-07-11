import type { WebClient } from "@slack/web-api";

export async function resolveChannelNames(
  client: WebClient,
  channelIds: string[],
): Promise<string[]> {
  const names: string[] = [];

  for (const channelId of channelIds) {
    try {
      const result = await client.conversations.info({ channel: channelId });
      names.push(result.channel?.name ?? channelId);
    } catch {
      names.push(channelId);
    }
  }

  return names;
}
