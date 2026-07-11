import "dotenv/config";
import express from "express";
import { App, LogLevel } from "@slack/bolt";
import { registerQuestionHandlers } from "./handlers/question.js";
import { registerOnboardingHandlers } from "./handlers/onboarding.js";
import { registerUpdateHandlers } from "./handlers/update.js";
import { registerExpertiseHandlers } from "./handlers/expertise.js";
import { registerOAuthRoutes } from "./auth/routes.js";
import { isDuplicateEvent } from "./utils/dedupe.js";

const requiredEnv = [
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "SLACK_APP_TOKEN",
] as const;

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

if (!process.env.BASE_URL) {
  console.warn(
    "⚠️  BASE_URL is not set. Wiki OAuth and onboarding buttons will not work until it is.",
  );
}

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  logLevel: (process.env.LOG_LEVEL as LogLevel) ?? LogLevel.INFO,
});

app.use(async ({ body, next }) => {
  const eventId = "event_id" in body ? String(body.event_id) : undefined;
  if (isDuplicateEvent(eventId)) {
    return;
  }
  await next();
});

registerOnboardingHandlers(app);
registerQuestionHandlers(app);
registerUpdateHandlers(app);
registerExpertiseHandlers(app);

const port = Number(process.env.PORT ?? 3000);
const oauthServer = express();
registerOAuthRoutes(oauthServer, app.client);

(async () => {
  oauthServer.listen(port, () => {
    console.log(`🔗 OAuth server listening on port ${port}`);
    if (process.env.BASE_URL) {
      console.log(
        `🔗 OAuth callbacks: ${process.env.BASE_URL.replace(/\/$/, "")}/oauth`,
      );
    }
  });

  await app.start();
  console.log("⚡️ Lore is connected via Socket Mode");
})();
