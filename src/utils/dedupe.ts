const seenEventIds = new Map<string, number>();
const TTL_MS = 60_000;

export function isDuplicateEvent(eventId: string | undefined): boolean {
  if (!eventId) {
    return false;
  }

  const now = Date.now();
  for (const [id, seenAt] of seenEventIds) {
    if (now - seenAt > TTL_MS) {
      seenEventIds.delete(id);
    }
  }

  if (seenEventIds.has(eventId)) {
    return true;
  }

  seenEventIds.set(eventId, now);
  return false;
}
