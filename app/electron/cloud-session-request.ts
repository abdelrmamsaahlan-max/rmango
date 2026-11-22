export type CloudAccessSession = { accessToken: string };
export type CloudRefreshSession = CloudAccessSession & {
  refreshToken: string;
  user: { id: string };
};

/**
 * Resolve a refresh request against the newest encrypted session on disk.
 * Another API call may already have rotated the refresh token; in that case
 * reuse the newer token rather than trying to refresh an already-used token.
 */
export function selectCurrentSessionForRefresh<T extends CloudRefreshSession>(
  requestedSession: T,
  currentSession: T | null,
): T {
  if (!currentSession || currentSession.user.id !== requestedSession.user.id) {
    throw new Error("Your Rmango account session is no longer available. Sign in again.");
  }
  return currentSession;
}

/**
 * Send an authenticated request and refresh exactly once when the access token
 * is rejected. Chat streaming uses this helper so it follows the same session
 * recovery behavior as the ordinary cloud API requests.
 */
export async function sendWithCloudSessionRefresh<T extends CloudAccessSession>(
  initialSession: T,
  send: (session: T) => Promise<Response>,
  refresh: (session: T) => Promise<T>,
): Promise<{ session: T; response: Response }> {
  let session = initialSession;
  let response = await send(session);

  if (response.status === 401) {
    await response.body?.cancel().catch(() => undefined);
    session = await refresh(session);
    response = await send(session);
  }

  return { session, response };
}
