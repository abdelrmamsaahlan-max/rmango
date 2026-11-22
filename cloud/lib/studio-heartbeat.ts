export const STUDIO_CONNECTOR_HEARTBEAT_INTERVAL_MS = 10_000;

export function shouldRefreshStudioConnectorHeartbeat(
  lastSeenAt: string | null | undefined,
  now = Date.now(),
) {
  if (!lastSeenAt) return true;

  const lastSeenTime = Date.parse(lastSeenAt);
  if (!Number.isFinite(lastSeenTime)) return true;

  const age = now - lastSeenTime;
  return age < 0 || age >= STUDIO_CONNECTOR_HEARTBEAT_INTERVAL_MS;
}
