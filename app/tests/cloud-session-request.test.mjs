import assert from "node:assert/strict";
import test from "node:test";
import { sendWithCloudSessionRefresh } from "../electron/cloud-session-request.ts";

test("refreshes a rejected access token and retries the chat request once", async () => {
  const initial = { accessToken: "old-access-token", refreshToken: "refresh-token" };
  const refreshed = { accessToken: "new-access-token", refreshToken: "rotated-refresh-token" };
  const sentTokens = [];
  let refreshCount = 0;

  const result = await sendWithCloudSessionRefresh(
    initial,
    async session => {
      sentTokens.push(session.accessToken);
      return new Response(null, { status: session.accessToken === "old-access-token" ? 401 : 200 });
    },
    async session => {
      refreshCount += 1;
      assert.equal(session.refreshToken, "refresh-token");
      return refreshed;
    },
  );

  assert.deepEqual(sentTokens, ["old-access-token", "new-access-token"]);
  assert.equal(refreshCount, 1);
  assert.equal(result.session.accessToken, "new-access-token");
  assert.equal(result.response.status, 200);
});

test("does not refresh a session when the initial chat request succeeds", async () => {
  const initial = { accessToken: "valid-access-token", refreshToken: "refresh-token" };
  let refreshCount = 0;
  let sendCount = 0;

  const result = await sendWithCloudSessionRefresh(
    initial,
    async () => {
      sendCount += 1;
      return new Response(null, { status: 200 });
    },
    async session => {
      refreshCount += 1;
      return session;
    },
  );

  assert.equal(sendCount, 1);
  assert.equal(refreshCount, 0);
  assert.equal(result.session, initial);
  assert.equal(result.response.status, 200);
});

test("propagates a failed refresh rather than retrying without valid credentials", async () => {
  const initial = { accessToken: "expired-access-token", refreshToken: "invalid-refresh-token" };
  let sendCount = 0;

  await assert.rejects(
    sendWithCloudSessionRefresh(
      initial,
      async () => {
        sendCount += 1;
        return new Response(null, { status: 401 });
      },
      async () => {
        throw new Error("Your saved Rmango session is invalid. Sign in again.");
      },
    ),
    /saved Rmango session is invalid/,
  );

  assert.equal(sendCount, 1);
});

test("does not create an unbounded retry loop when the refreshed token is also rejected", async () => {
  const initial = { accessToken: "old-access-token", refreshToken: "refresh-token" };
  let sendCount = 0;
  let refreshCount = 0;

  const result = await sendWithCloudSessionRefresh(
    initial,
    async () => {
      sendCount += 1;
      return new Response(null, { status: 401 });
    },
    async session => {
      refreshCount += 1;
      return { ...session, accessToken: "refreshed-access-token" };
    },
  );

  assert.equal(sendCount, 2);
  assert.equal(refreshCount, 1);
  assert.equal(result.response.status, 401);
});
