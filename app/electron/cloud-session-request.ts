export type CloudAccessSession = { accessToken: string };

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
