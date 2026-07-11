import { buildExcerpt } from "../utils/formatter.js";
import { searchSlackThreads } from "./search.js";
import type { SearchSlackOptions } from "./search.js";

export interface UserActivitySample {
  channelName: string;
  date: string;
  excerpt: string;
  permalink: string;
}

export interface UserActivity {
  userId: string;
  displayName?: string;
  messageCount: number;
  mostRecentDate: string;
  samples: UserActivitySample[];
}

export async function aggregateSlackActivity(
  options: SearchSlackOptions,
): Promise<UserActivity[]> {
  const chunks = await searchSlackThreads({ ...options, limit: options.limit ?? 20 });
  const byUser = new Map<string, UserActivity>();

  for (const chunk of chunks) {
    if (!chunk.authorUserId || chunk.isAuthorBot) {
      continue;
    }

    const sample: UserActivitySample = {
      channelName: chunk.channelName,
      date: chunk.date,
      excerpt: buildExcerpt(chunk.content, "", 160),
      permalink: chunk.permalink,
    };

    const existing = byUser.get(chunk.authorUserId);
    if (existing) {
      existing.messageCount += 1;
      if (Date.parse(chunk.date) > Date.parse(existing.mostRecentDate)) {
        existing.mostRecentDate = chunk.date;
      }
      if (existing.samples.length < 3) {
        existing.samples.push(sample);
      }
    } else {
      byUser.set(chunk.authorUserId, {
        userId: chunk.authorUserId,
        displayName: chunk.authorName,
        messageCount: 1,
        mostRecentDate: chunk.date,
        samples: [sample],
      });
    }
  }

  return [...byUser.values()].sort((a, b) => {
    if (b.messageCount !== a.messageCount) {
      return b.messageCount - a.messageCount;
    }
    return Date.parse(b.mostRecentDate) - Date.parse(a.mostRecentDate);
  });
}
