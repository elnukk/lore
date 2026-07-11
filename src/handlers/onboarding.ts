import type { App } from "@slack/bolt";
import {
  getWorkspace,
  isOnboardingComplete,
  setWatchedChannels,
} from "../config/workspace.js";
import {
  channelPickerModal,
  channelSelectionBlocks,
  welcomeBlocks,
} from "../blocks/onboardingCard.js";
import { sendSetupCompleteMessage } from "../auth/routes.js";

function getBaseUrl(): string | null {
  const url = process.env.BASE_URL?.trim();
  return url ? url.replace(/\/$/, "") : null;
}

export function registerOnboardingHandlers(app: App): void {
  app.event("app_home_opened", async ({ event, client, body }) => {
    const teamId = body.team_id;
    if (!teamId) {
      return;
    }

    const config = await getWorkspace(teamId);
    if (isOnboardingComplete(config)) {
      return;
    }

    const baseUrl = getBaseUrl();
    if (!baseUrl) {
      await client.chat.postMessage({
        channel: event.user,
        text: "Welcome to Lore. Set BASE_URL in your server config to connect a wiki.",
      });
      return;
    }

    if (config.wiki) {
      await client.chat.postMessage({
        channel: event.user,
        text: "Choose channels for Lore to monitor.",
        blocks: channelSelectionBlocks(),
      });
      return;
    }

    await client.chat.postMessage({
      channel: event.user,
      text: "Welcome to Lore. Connect your wiki to get started.",
      blocks: welcomeBlocks(baseUrl, teamId, event.user),
    });
  });

  app.action("onboarding_open_channel_modal", async ({ ack, body, client }) => {
    await ack();

    if (!("trigger_id" in body) || !body.trigger_id) {
      return;
    }

    await client.views.open({
      trigger_id: body.trigger_id,
      view: channelPickerModal(),
    });
  });

  app.view("onboarding_channels_submit", async ({ ack, body, view, client }) => {
    const teamId = body.team?.id;
    const userId = body.user.id;
    if (!teamId) {
      await ack();
      return;
    }

    const selected =
      view.state.values.channels_block?.watched_channels?.selected_channels ??
      [];

    if (selected.length === 0) {
      await ack({
        response_action: "errors",
        errors: {
          channels_block: "Select at least one channel.",
        },
      });
      return;
    }

    await ack();
    await setWatchedChannels(teamId, selected);
    await sendSetupCompleteMessage(client, teamId, userId);
  });

  app.action("onboarding_channels_done", async ({ ack, body, client }) => {
    await ack();

    const teamId = body.team?.id;
    const userId = body.user.id;
    if (!teamId) {
      return;
    }

    const config = await getWorkspace(teamId);
    if (config.watchedChannels.length === 0) {
      await client.chat.postEphemeral({
        channel: body.channel?.id ?? userId,
        user: userId,
        text: "Select channels first using the *Select channels* button.",
      });
      return;
    }

    await sendSetupCompleteMessage(client, teamId, userId);
  });
}
