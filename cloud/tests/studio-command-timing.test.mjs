import test from "node:test";
import assert from "node:assert/strict";
import {
  STUDIO_COMMAND_MAX_POLL_ATTEMPTS,
  STUDIO_COMMAND_MAX_WAIT_MS,
  STUDIO_COMMAND_POLL_INTERVAL_MS,
} from "../lib/studio-command-timing.ts";

test("cloud waits longer than the desktop approval window", () => {
  const desktopApprovalTimeoutMs = 60_000;
  const actualWaitMs = STUDIO_COMMAND_MAX_POLL_ATTEMPTS * STUDIO_COMMAND_POLL_INTERVAL_MS;
  assert.ok(actualWaitMs >= STUDIO_COMMAND_MAX_WAIT_MS);
  assert.ok(actualWaitMs >= desktopApprovalTimeoutMs + 14_000);
});

test("the Studio result wait remains bounded below the cloud route timeout", () => {
  assert.ok(STUDIO_COMMAND_MAX_WAIT_MS < 120_000);
  assert.equal(STUDIO_COMMAND_POLL_INTERVAL_MS, 750);
});
