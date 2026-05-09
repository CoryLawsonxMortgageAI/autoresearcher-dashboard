import Pusher from "pusher";
import { getDb, events as eventsTable } from "@autoresearcher/db";
import type { ActivityEvent, PusherChannel } from "@autoresearcher/shared";
import { randomUUID } from "node:crypto";

let _pusher: Pusher | null = null;
let _lastSuccess = Date.now();

const getPusher = (): Pusher | null => {
  if (_pusher) return _pusher;
  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env;
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET || !PUSHER_CLUSTER) return null;
  _pusher = new Pusher({
    appId: PUSHER_APP_ID,
    key: PUSHER_KEY,
    secret: PUSHER_SECRET,
    cluster: PUSHER_CLUSTER,
    useTLS: true,
  });
  return _pusher;
};

// Per directive: Pusher fail >60s is a stop condition. We track last success.
export const pusherHealth = (): { healthy: boolean; staleMs: number } => {
  const staleMs = Date.now() - _lastSuccess;
  return { healthy: staleMs < 60_000, staleMs };
};

export const publishEvent = async (
  channel: PusherChannel,
  evt: ActivityEvent,
  runId?: string
): Promise<void> => {
  // Always write to events table first so the activity feed survives Pusher outages.
  const db = getDb();
  await db.insert(eventsTable).values({
    id: randomUUID(),
    type: evt.type,
    channel,
    payload: evt as unknown as Record<string, unknown>,
    publishedAt: new Date(),
    runId: runId ?? null,
  });

  const p = getPusher();
  if (!p) {
    console.warn(`[pusher] not configured; event '${evt.type}' persisted to db only`);
    return;
  }
  try {
    await p.trigger(channel, evt.type, evt);
    _lastSuccess = Date.now();
  } catch (err) {
    console.error(`[pusher] publish failed for '${evt.type}'`, err);
    // Do NOT throw: event is durable in the events table. Health check picks
    // up the staleness and an external watchdog files the BLOCKER.
  }
};
