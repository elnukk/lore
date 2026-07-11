import type { Block, KnownBlock, View } from "@slack/types";
import type { WikiProvider } from "../config/workspace.js";

const WIKI_LABELS: Record<WikiProvider, string> = {
  notion: "Notion",
  confluence: "Confluence",
  drive: "Google Drive",
};

export function welcomeBlocks(baseUrl: string, teamId: string, userId: string): (Block | KnownBlock)[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          "👋 *Hey! I'm Lore.*",
          "",
          "I watch your Slack conversations and cross-check them against your wiki — so when docs go stale, you'll know, and fixing them takes one click.",
          "",
          "To get started, connect your wiki:",
        ].join("\n"),
      },
    },
    {
      type: "actions",
      elements: (["notion", "confluence", "drive"] as WikiProvider[]).map(
        (provider) => ({
          type: "button" as const,
          text: {
            type: "plain_text" as const,
            text: `Connect ${WIKI_LABELS[provider]}`,
          },
          url: `${baseUrl}/oauth/${provider}/start?team_id=${encodeURIComponent(teamId)}&user_id=${encodeURIComponent(userId)}`,
          action_id: `connect_${provider}`,
        }),
      ),
    },
  ];
}

export function wikiConnectedBlocks(provider: WikiProvider): (Block | KnownBlock)[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `✅ *${WIKI_LABELS[provider]} connected.*`,
      },
    },
    ...channelSelectionBlocks(),
  ];
}

export function channelSelectionBlocks(): (Block | KnownBlock)[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Which channels should I monitor for knowledge updates?",
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Select channels ▾" },
          action_id: "onboarding_open_channel_modal",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Done →" },
          action_id: "onboarding_channels_done",
          style: "primary",
        },
      ],
    },
  ];
}

export function channelPickerModal(): View {
  return {
    type: "modal",
    callback_id: "onboarding_channels_submit",
    title: { type: "plain_text", text: "Select channels" },
    submit: { type: "plain_text", text: "Done" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "channels_block",
        label: { type: "plain_text", text: "Channels to monitor" },
        element: {
          type: "multi_channels_select",
          action_id: "watched_channels",
          placeholder: { type: "plain_text", text: "Select channels" },
        },
      },
    ],
  };
}

export function setupCompleteBlocks(channelNames: string[]): (Block | KnownBlock)[] {
  const channelList = channelNames.map((name) => `#${name}`).join(", ");
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          `✅ *You're set up.* I'm now watching ${channelList}.`,
          "",
          "Ask me anything — or wait for me to spot something.",
        ].join("\n"),
      },
    },
  ];
}
