import test from "node:test";
import assert from "node:assert/strict";
import {
  shouldRefreshStudioConnectorHeartbeat,
  STUDIO_CONNECTOR_HEARTBEAT_INTERVAL_MS,
} from "../lib/studio-heartbeat.ts";

const now = Date.parse("2026-11-22T16:00:00.000Z");

test("refreshes a missing or invalid connector heartbeat", () => {
  assert.equal(shouldRefreshStudioConnectorHeartbeat(null, now), true);
  assert.equal(shouldRefreshStudioConnectorHeartbeat(undefined, now), true);
  assert.equal(shouldRefreshStudioConnectorHeartbeat("not-a-date", now), true);
});

test("does not write a heartbeat on every 1.4 second polling request", () => {
  const lastSeen = new Date(now - 1_400).toISOString();
  assert.equal(shouldRefreshStudioConnectorHeartbeat(lastSeen, now), false);
});

test("refreshes the heartbeat before the 30 second chat-tool expiry", () => {
  const lastSeen = new Date(now - STUDIO_CONNECTOR_HEARTBEAT_INTERVAL_MS).toISOString();
  assert.equal(shouldRefreshStudioConnectorHeartbeat(lastSeen, now), true);
});

test("repairs a future-dated timestamp instead of extending connector liveness", () => {
  const lastSeen = new Date(now + 5_000).toISOString();
  assert.equal(shouldRefreshStudioConnectorHeartbeat(lastSeen, now), true);
});
