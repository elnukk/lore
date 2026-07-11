import type { App } from "@slack/bolt";
import {
  updateCardBlocks,
  updateDiscardedBlocks,
  updateSuccessBlocks,
} from "../blocks/updateCard.js";
import { draftDocUpdate } from "../claude/draft.js";
import {
  createPendingDraft,
  deletePendingDraft,
  getPendingConflict,
  getPendingDraft,
} from "../context/pendingUpdates.js";
import { getWorkspace } from "../config/workspace.js";
import { ensureFreshWiki } from "../config/wikiToken.js";
import { updateWikiDoc } from "../mcp/index.js";
import { providerLabel } from "../utils/formatter.js";

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

export function registerUpdateHandlers(app: App): void {
  app.action("conflict_update_doc", async ({ ack, body, respond }) => {
    await ack();

    const action = getButtonAction(body);
    let updateId: string | undefined;
    try {
      updateId = action?.value ? JSON.parse(action.value).updateId : undefined;
    } catch {
      updateId = undefined;
    }

    const pending = updateId ? getPendingConflict(updateId) : undefined;

    if (!pending) {
      await respond({
        replace_original: false,
        text: "This conflict has expired. Ask the question again to get a fresh draft.",
      });
      return;
    }

    await respond({ replace_original: false, text: "📝 Drafting an update..." });

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

      await respond({
        replace_original: false,
        text: `Here's a draft update for ${pending.wiki.title}`,
        blocks: updateCardBlocks({
          docTitle: pending.wiki.title,
          before: draft.before,
          after: draft.after,
          reason: draft.reason,
          slackChannel: pending.slack.channel,
          slackUrl: pending.slack.url,
          wikiUrl: pending.wiki.url,
          draftId,
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await respond({
        replace_original: false,
        text: `Couldn't draft an update: ${message}`,
      });
    }
  });

  app.action("doc_update_approve", async ({ ack, body, respond }) => {
    await ack();

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
        blocks: updateSuccessBlocks(draft.wiki.title, draft.wiki.provider, draft.wiki.url),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await respond({
        replace_original: false,
        text: `Couldn't update the doc: ${message}`,
      });
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
      blocks: updateDiscardedBlocks(),
    });
  });
}
