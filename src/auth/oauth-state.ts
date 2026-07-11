import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { WikiProvider } from "../config/workspace.js";

export interface OAuthStatePayload {
  teamId: string;
  userId: string;
  provider: WikiProvider;
  nonce: string;
  issuedAt: number;
}

function signingSecret(): string {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) {
    throw new Error("SLACK_SIGNING_SECRET is required for OAuth state");
  }
  return secret;
}

export function createOAuthState(
  teamId: string,
  userId: string,
  provider: WikiProvider,
): string {
  const payload: OAuthStatePayload = {
    teamId,
    userId,
    provider,
    nonce: randomBytes(16).toString("hex"),
    issuedAt: Date.now(),
  };

  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", signingSecret())
    .update(encoded)
    .digest("base64url");

  return `${encoded}.${signature}`;
}

export function parseOAuthState(state: string): OAuthStatePayload {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) {
    throw new Error("Invalid OAuth state");
  }

  const expected = createHmac("sha256", signingSecret())
    .update(encoded)
    .digest("base64url");

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (
    sigBuf.length !== expectedBuf.length ||
    !timingSafeEqual(sigBuf, expectedBuf)
  ) {
    throw new Error("Invalid OAuth state signature");
  }

  const payload = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  ) as OAuthStatePayload;

  const maxAgeMs = 15 * 60 * 1000;
  if (Date.now() - payload.issuedAt > maxAgeMs) {
    throw new Error("OAuth state expired");
  }

  return payload;
}
