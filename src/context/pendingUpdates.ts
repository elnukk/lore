import { randomUUID } from "node:crypto";
import type { WikiProvider } from "../config/workspace.js";

const TTL_MS = 30 * 60_000;

export interface PendingConflictWiki {
  provider: WikiProvider;
  docId: string;
  title: string;
  url: string;
  content: string;
}

export interface PendingConflictSlack {
  channel: string;
  url: string;
  content: string;
}

export interface PendingConflict {
  teamId: string;
  question: string;
  wiki: PendingConflictWiki;
  slack: PendingConflictSlack;
  createdAt: number;
}

export interface PendingDraft {
  teamId: string;
  wiki: PendingConflictWiki;
  before: string;
  after: string;
  createdAt: number;
}

const pendingConflicts = new Map<string, PendingConflict>();
const pendingDrafts = new Map<string, PendingDraft>();

function sweep<T extends { createdAt: number }>(store: Map<string, T>): void {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (now - entry.createdAt > TTL_MS) {
      store.delete(id);
    }
  }
}

export function createPendingConflict(
  data: Omit<PendingConflict, "createdAt">,
): string {
  sweep(pendingConflicts);
  const id = randomUUID();
  pendingConflicts.set(id, { ...data, createdAt: Date.now() });
  return id;
}

export function getPendingConflict(id: string): PendingConflict | undefined {
  sweep(pendingConflicts);
  return pendingConflicts.get(id);
}

export function createPendingDraft(data: Omit<PendingDraft, "createdAt">): string {
  sweep(pendingDrafts);
  const id = randomUUID();
  pendingDrafts.set(id, { ...data, createdAt: Date.now() });
  return id;
}

export function getPendingDraft(id: string): PendingDraft | undefined {
  sweep(pendingDrafts);
  return pendingDrafts.get(id);
}

export function deletePendingDraft(id: string): void {
  pendingDrafts.delete(id);
}
