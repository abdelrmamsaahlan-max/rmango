import { timingSafeEqual } from "node:crypto";

export const GOOGLE_OAUTH_CALLBACK_HOST = "127.0.0.1:43821";
export const GOOGLE_OAUTH_CALLBACK_PATH = "/auth/callback";
export const GOOGLE_OAUTH_CALLBACK_ORIGIN = "http://" + GOOGLE_OAUTH_CALLBACK_HOST;

export type OAuthCallbackRequest = {
  method?: string;
  url?: string;
  host?: string;
  remoteAddress?: string;
};

export function isValidGoogleOAuthCallback(
  request: OAuthCallbackRequest,
  expectedState: string,
): boolean {
  if (request.method !== "GET" || request.host !== GOOGLE_OAUTH_CALLBACK_HOST) return false;
  if (request.remoteAddress !== "127.0.0.1" &&
      request.remoteAddress !== "::ffff:127.0.0.1") return false;

  let callback: URL;
  try {
    callback = new URL(request.url || "/", GOOGLE_OAUTH_CALLBACK_ORIGIN);
  } catch {
    return false;
  }

  if (callback.origin !== GOOGLE_OAUTH_CALLBACK_ORIGIN ||
      callback.pathname !== GOOGLE_OAUTH_CALLBACK_PATH) return false;

  const receivedState = callback.searchParams.get("state") || "";
  const expected = Buffer.from(expectedState, "utf8");
  const received = Buffer.from(receivedState, "utf8");
  return expected.length > 0 &&
    expected.length === received.length &&
    timingSafeEqual(expected, received);
}
