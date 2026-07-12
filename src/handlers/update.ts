import type { App, SayFn } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import type { Block, KnownBlock } from "@slack/types";
import {
  UPDATE_DISCARDED_COLOR,
  UPDATE_DRAFT_COLOR,
  UPDATE_SUCCESS_COLOR,
  updateCardActions,
  updateCardBlocks,
  updateDiscardedBlocks,
  updateSuccessActions,
  updateSuccessBlocks,
} from "../blocks/updateCard.js";
import { draftDocUpdate } from "../claude/draft.js";
import type { WorkspaceConfig } from "../config/workspace.js";
import {
  createPendingDraft,
  deletePendingDraft,
  getPendingConflict,
  getPendingDraft,
} from "../context/pendingUpdates.js";
import { getWorkspace } from "../config/workspace.js";
import { ensureFreshWiki } from "../config/wikiToken.js";
import { searchWikiDocs, updateWikiDoc } from "../mcp/index.js";
import { providerLabel } from "../utils/formatter.js";
import {
  extractKeywords,
  extractSearchTerms,
  extractUpdateTopic,
} from "../utils/keywords.js";

interface ButtonAction {
  value?: string;
}

function getButtonAction(body: unknown): ButtonAction | undefined {
  if (
    typeof body === "object" &&
    body !== null &&
    "actions" in body &&
    Array.isArray((body as { actions: unknown }).actions)
  ) {
    return (body as { actions: ButtonAction[] }).actions[0];
  }
  return undefined;
}

/**
 * Slack's response_url (used by `respond()`) can only replace the message it
 * came from or post a new one at the channel root — it has no concept of
 * thread_ts. So any NEW message created from a button click (as opposed to
 * editing the message the button lives on) has to go through
 * chat.postEphemeral instead, which does support thread_ts, or it silently
 * breaks out of the thread the button was clicked in.
 */
function getMessageContext(body: unknown): {
  channelId?: string;
  threadTs?: string;
  userId?: string;
} {
  if (typeof body !== "object" || body === null) {
    return {};
  }

  const b = body as {
    channel?: { id?: string };
    message?: { thread_ts?: string; ts?: string };
    user?: { id?: string };
  };

  return {
    channelId: b.channel?.id,
    threadTs: b.message?.thread_ts ?? b.message?.ts,
    userId: b.user?.id,
  };
}

export function registerUpdateHandlers(app: App): void {
  app.action("conflict_update_doc", async ({ ack, body, client }) => {
    await ack();

    const { channelId, threadTs, userId } = getMessageContext(body);

    interface StatusPayload {
      text: string;
      blocks?: (Block | KnownBlock)[];
      attachments?: Array<{ color: string; blocks: (Block | KnownBlock)[] }>;
    }

    const postStatus = async (payload: StatusPayload) => {
      if (!channelId || !userId) {
        return;
      }
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        thread_ts: threadTs,
        ...payload,
      } as Parameters<typeof client.chat.postEphemeral>[0]);
    };

    const action = getButtonAction(body);
    let updateId: string | undefined;
    try {
      updateId = action?.value ? JSON.parse(action.value).updateId : undefined;
    } catch {
      updateId = undefined;
    }

    const pending = updateId ? getPendingConflict(updateId) : undefined;

    if (!pending) {
      await postStatus({
        text: "This conflict has expired. Ask the question again to get a fresh draft.",
      });
      return;
    }

    await postStatus({ text: "📝 Drafting an update..." });

    try {
      const draft = await draftDocUpdate({
        docTitle: pending.wiki.title,
        fullDoc: pending.wiki.content,
        threadContent: pending.slack.content,
      });

      const draftId = createPendingDraft({
        teamId: pending.teamId,
        wiki: pending.wiki,
        before: draft.before,
        after: draft.after,
      });

      const draftInput = {
        docTitle: pending.wiki.title,
        before: draft.before,
        after: draft.after,
        reason: draft.reason,
        slackChannel: pending.slack.channel,
        slackUrl: pending.slack.url,
        wikiUrl: pending.wiki.url,
        draftId,
      };

      await postStatus({
        text: `Here's a draft update for ${pending.wiki.title}`,
        blocks: updateCardActions(draftInput),
        attachments: [{ color: UPDATE_DRAFT_COLOR, blocks: updateCardBlocks(draftInput) }],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await postStatus({ text: `Couldn't draft an update: ${message}` });
    }
  });

  app.action("doc_update_approve", async ({ ack, body, respond, client }) => {
    await ack();

    const { channelId, threadTs, userId } = getMessageContext(body);
    const action = getButtonAction(body);
    const draftId = action?.value;
    const draft = draftId ? getPendingDraft(draftId) : undefined;

    if (!draft) {
      await respond({
        replace_original: true,
        text: "This draft has expired. Ask the question again to get a fresh one.",
        blocks: [],
      });
      return;
    }

    try {
      const config = await getWorkspace(draft.teamId);
      if (!config.wiki || config.wiki.provider !== draft.wiki.provider) {
        throw new Error(
          `${providerLabel(draft.wiki.provider)} is no longer connected for this workspace.`,
        );
      }

      const freshWiki = await ensureFreshWiki(config);
      if (!freshWiki) {
        throw new Error(
          `${providerLabel(draft.wiki.provider)} is no longer connected for this workspace.`,
        );
      }

      await updateWikiDoc(freshWiki, draft.wiki.docId, {
        before: draft.before,
        after: draft.after,
      });

      deletePendingDraft(draftId as string);

      await respond({
        replace_original: true,
        text: `✅ ${draft.wiki.title} has been updated in ${providerLabel(draft.wiki.provider)}.`,
        blocks: updateSuccessActions(draft.wiki.url),
        attachments: [
          {
            color: UPDATE_SUCCESS_COLOR,
            blocks: updateSuccessBlocks(draft.wiki.title, draft.wiki.provider),
          },
        ],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (channelId && userId) {
        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          thread_ts: threadTs,
          text: `Couldn't update the doc: ${message}`,
        });
      }
    }
  });

  app.action("doc_update_discard", async ({ ack, body, respond }) => {
    await ack();

    const action = getButtonAction(body);
    if (action?.value) {
      deletePendingDraft(action.value);
    }

    await respond({
      replace_original: true,
      text: "Discarded. No changes made.",
      attachments: [{ color: UPDATE_DISCARDED_COLOR, blocks: updateDiscardedBlocks() }],
    });
  });
}

export async function handleUpdateInstruction(
  instructionText: string,
  teamId: string | undefined,
  config: WorkspaceConfig | null,
  client: WebClient,
  say: SayFn,
  channelId: string | undefined,
  threadTs: string | undefined,
): Promise<void> {
  const wiki = config?.wiki;

  if (!wiki) {
    await say({
      text: "Connect a wiki first (check the Home tab) so I have something to update.",
      thread_ts: threadTs,
    });
    return;
  }

  let threadContent = "";
  if (channelId && threadTs) {
    try {
      const replies = await client.conversations.replies({
        channel: channelId,
        ts: threadTs,
        limit: 50,
      });
      threadContent = (replies.messages ?? [])
        .map((message) => message.text ?? "")
        .filter(Boolean)
        .join("\n");
    } catch {
      threadContent = "";
    }
  }

  const explicitTopic = extractUpdateTopic(instructionText);
  const searchQuery =
    explicitTopic ||
    extractSearchTerms(`${instructionText} ${threadContent}`).slice(0, 8).join(" ") ||
    extractKeywords(instructionText);

  if (!threadContent.trim()) {
    threadContent = instructionText;
  }

  const wikiChunks = await searchWikiDocs(wiki, { query: searchQuery, limit: 3 }).catch(
    () => [],
  );

  if (wikiChunks.length === 0) {
    await say({
      text: `I couldn't find a wiki page matching "${searchQuery}" to update.`,
      thread_ts: threadTs,
    });
    return;
  }

  const targetDoc = wikiChunks[0];

  try {
    const draft = await draftDocUpdate({
      docTitle: targetDoc.title,
      fullDoc: targetDoc.content,
      threadContent,
    });

    const draftId = createPendingDraft({
      teamId: teamId ?? "",
      wiki: {
        provider: targetDoc.provider,
        docId: targetDoc.docId,
        title: targetDoc.title,
        url: targetDoc.url,
        content: targetDoc.content,
      },
      before: draft.before,
      after: draft.after,
    });

    const draftInput = {
      docTitle: targetDoc.title,
      before: draft.before,
      after: draft.after,
      reason: draft.reason,
      wikiUrl: targetDoc.url,
      draftId,
    };

    await say({
      text: `Here's a draft update for ${targetDoc.title}`,
      blocks: updateCardActions(draftInput),
      attachments: [{ color: UPDATE_DRAFT_COLOR, blocks: updateCardBlocks(draftInput) }],
      thread_ts: threadTs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await say({ text: `Couldn't draft an update: ${message}`, thread_ts: threadTs });
  }
}
