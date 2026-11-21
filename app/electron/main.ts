import { app, BrowserWindow, dialog, ipcMain, Notification, safeStorage, shell, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import {
  GOOGLE_OAUTH_CALLBACK_ORIGIN,
  GOOGLE_OAUTH_CALLBACK_PATH,
  isValidGoogleOAuthCallback,
} from './oauth-security.js';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import electronUpdater from 'electron-updater';

const { autoUpdater } = electronUpdater;

type CloudProfile = 'fast' | 'developer' | 'think' | 'vision' | 'agent';
type ChatMessage = {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
  attachments?: Array<{ id: string; name: string; mimeType: string; kind: 'image' | 'file'; size: number }>;
  modelProfile?: CloudProfile;
};
type CloudConversation = {
  id: string;
  project_id: string | null;
  title: string;
  model_profile: CloudProfile;
  created_at: string;
  updated_at: string;
};
type CloudAgentTask = {
  id: string;
  project_id: string | null;
  conversation_id: string | null;
  status: 'queued' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled';
  task_text: string;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  events: Array<{
    id: number;
    task_id: string;
    event_type: string;
    message: string;
    data: Record<string, unknown>;
    created_at: string;
  }>;
};
type CloudProject = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
};
type Attachment = { name: string; mimeType: string; kind: 'image' | 'file'; size: number; data: string };
type AppearanceTheme = 'dark' | 'light' | 'system';
type SettingsFile = {
  projectPath?: string;
  appearance: AppearanceTheme;
  density: 'comfortable' | 'compact';
  animationsEnabled: boolean;
  reducedMotion: boolean;
  fontSize: 'small' | 'medium' | 'large';
  sendOnEnter: boolean;
  desktopNotifications: boolean;
  autoUpdatesEnabled: boolean;
  defaultCloudProfile: CloudProfile;
  saveLocalChatHistory: boolean;
  showInspectorByDefault: boolean;
};
type SettingsPatch = Partial<Omit<SettingsFile, 'projectPath'>>;
type CloudSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
  user: { id: string; email?: string };
  studioConnectorId?: string;
  studioConnectorSecret?: string;
  currentProjectId?: string;
  currentConversationId?: string;
};
type McpTool = { name: string; description?: string; inputSchema: Record<string, any> };
type StudioInstance = { id: string; name: string; placeId?: string };
type ApprovalRequest = { requestId: string; name: string; description: string; arguments: Record<string, unknown> };
type ActivityItem = { id?: string; name: string; detail: string; ok: boolean; status?: 'running' | 'completed' | 'failed' | 'cancelled' };
type AppUpdateState = {
  status: 'idle' | 'unsupported' | 'checking' | 'downloading' | 'downloaded' | 'not-available' | 'error';
  currentVersion: string;
  availableVersion?: string;
  progress?: number;
  message?: string;
  error?: string;
  releaseNotes?: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPROVAL_TIMEOUT_MS = 120_000;

let mainWindow: BrowserWindow | null = null;
let mcpClient: Client | null = null;
let mcpTransport: StdioClientTransport | null = null;
let connectedTools: McpTool[] = [];
let selectedStudioId: string | undefined;
let studioInstances: StudioInstance[] = [];
let studioPollTimer: NodeJS.Timeout | null = null;
let studioPollInFlight = false;
const approvalResolvers = new Map<string, (approved: boolean) => void>();
const activeChatRequests = new Map<string, AbortController>();
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
let updateCheckInFlight = false;
let lastUpdateCheckAt = 0;
let updateStartupTimer: NodeJS.Timeout | null = null;
let updateCheckTimer: NodeJS.Timeout | null = null;
let appUpdateState: AppUpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  message: 'Updates are checked automatically.',
};

const userData = () => app.getPath('userData');
const settingsPath = () => path.join(userData(), 'settings.json');
const sessionPath = () => path.join(userData(), 'session.json');
const cloudSessionPath = () => path.join(userData(), 'cloud-session.enc');

let cloudAuthGeneration = 0;
let cloudRefreshFlight: {
  refreshToken: string;
  generation: number;
  promise: Promise<CloudSession>;
} | null = null;
let pendingGoogleOAuth: { cancel: () => void } | null = null;

function resetCloudAuthRefreshState() {
  cloudAuthGeneration += 1;
  cloudRefreshFlight = null;
}

const DEFAULT_SETTINGS: SettingsFile = {
  appearance: 'dark',
  density: 'comfortable',
  animationsEnabled: true,
  reducedMotion: false,
  fontSize: 'medium',
  sendOnEnter: true,
  desktopNotifications: false,
  autoUpdatesEnabled: true,
  defaultCloudProfile: 'developer',
  saveLocalChatHistory: true,
  showInspectorByDefault: true,
};

function normaliseSettings(value: Partial<SettingsFile> | null | undefined): SettingsFile {
  const input = value || {};
  return {
    projectPath: typeof input.projectPath === 'string' ? input.projectPath : undefined,
    appearance: input.appearance === 'light' || input.appearance === 'system' || input.appearance === 'dark' ? input.appearance : DEFAULT_SETTINGS.appearance,
    density: input.density === 'compact' || input.density === 'comfortable' ? input.density : DEFAULT_SETTINGS.density,
    animationsEnabled: typeof input.animationsEnabled === 'boolean' ? input.animationsEnabled : DEFAULT_SETTINGS.animationsEnabled,
    reducedMotion: typeof input.reducedMotion === 'boolean' ? input.reducedMotion : DEFAULT_SETTINGS.reducedMotion,
    fontSize: input.fontSize === 'small' || input.fontSize === 'large' || input.fontSize === 'medium' ? input.fontSize : DEFAULT_SETTINGS.fontSize,
    sendOnEnter: typeof input.sendOnEnter === 'boolean' ? input.sendOnEnter : DEFAULT_SETTINGS.sendOnEnter,
    desktopNotifications: typeof input.desktopNotifications === 'boolean' ? input.desktopNotifications : DEFAULT_SETTINGS.desktopNotifications,
    autoUpdatesEnabled: typeof input.autoUpdatesEnabled === 'boolean' ? input.autoUpdatesEnabled : DEFAULT_SETTINGS.autoUpdatesEnabled,
    defaultCloudProfile: input.defaultCloudProfile === 'fast' || input.defaultCloudProfile === 'developer' || input.defaultCloudProfile === 'think' || input.defaultCloudProfile === 'vision' || input.defaultCloudProfile === 'agent' ? input.defaultCloudProfile : DEFAULT_SETTINGS.defaultCloudProfile,
    saveLocalChatHistory: typeof input.saveLocalChatHistory === 'boolean' ? input.saveLocalChatHistory : DEFAULT_SETTINGS.saveLocalChatHistory,
    showInspectorByDefault: typeof input.showInspectorByDefault === 'boolean' ? input.showInspectorByDefault : DEFAULT_SETTINGS.showInspectorByDefault,
  };
}

async function readSettings(): Promise<SettingsFile> {
  try {
    const parsed = JSON.parse(await fs.readFile(settingsPath(), 'utf8')) as Partial<SettingsFile>;
    return normaliseSettings(parsed);
  } catch {
    return normaliseSettings(DEFAULT_SETTINGS);
  }
}

async function writeSettings(settings: SettingsFile) {
  await fs.mkdir(userData(), { recursive: true });
  const filePath = settingsPath();
  const temporaryPath = filePath + '.tmp';
  await fs.writeFile(temporaryPath, JSON.stringify(normaliseSettings(settings), null, 2), { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temporaryPath, filePath);
}

async function configureAutoUpdateSchedule(enabled: boolean) {
  if (updateStartupTimer) clearTimeout(updateStartupTimer);
  if (updateCheckTimer) clearInterval(updateCheckTimer);
  updateStartupTimer = null;
  updateCheckTimer = null;
  if (!enabled || !app.isPackaged || process.platform !== 'win32') return;

  updateStartupTimer = setTimeout(() => { void checkForAppUpdates(); }, 8_000);
  updateStartupTimer.unref?.();
  updateCheckTimer = setInterval(() => { void checkForAppUpdates(); }, UPDATE_CHECK_INTERVAL_MS);
  updateCheckTimer.unref?.();
}

async function getCloudApiBaseUrl(): Promise<string> {
  const fromEnvironment = process.env.RMANGO_CLOUD_API_URL?.trim();
  if (fromEnvironment) return fromEnvironment.replace(/\/+$/, '');
  try {
    const configPath = path.join(app.getAppPath(), 'cloud-config.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf8')) as { apiBaseUrl?: string };
    return typeof config.apiBaseUrl === 'string' ? config.apiBaseUrl.trim().replace(/\/+$/, '') : '';
  } catch {
    return '';
  }
}

async function readCloudSession(): Promise<CloudSession | null> {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const encrypted = await fs.readFile(cloudSessionPath(), 'utf8');
    const parsed = JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, 'base64'))) as CloudSession;
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCloudSession(session: CloudSession) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows secure storage is unavailable. Rmango cannot safely store your cloud session on this device.');
  }
  await fs.mkdir(userData(), { recursive: true });
  const encrypted = safeStorage.encryptString(JSON.stringify(session)).toString('base64');
  await fs.writeFile(cloudSessionPath(), encrypted, { encoding: 'utf8', mode: 0o600 });
}

async function clearCloudSession() {
  await stopStudioConnectorPolling();
  try { await fs.rm(cloudSessionPath(), { force: true }); } catch { /* file may not exist */ }
}

async function refreshCloudSession(session: CloudSession): Promise<CloudSession> {
  const generation = cloudAuthGeneration;
  const currentFlight = cloudRefreshFlight;
  if (currentFlight && currentFlight.refreshToken === session.refreshToken && currentFlight.generation === generation) {
    return currentFlight.promise;
  }

  const promise = (async () => {
    const baseUrl = await getCloudApiBaseUrl();
    if (!baseUrl) throw new Error('The Rmango cloud backend is not configured in this build.');

    const response = await fetch(baseUrl + '/api/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
      signal: AbortSignal.timeout(20_000),
    });
    const raw = await response.text();
    let payload: any = {};
    try { payload = raw ? JSON.parse(raw) : {}; }
    catch { payload = { error: raw.slice(0, 500) }; }

    if (!response.ok || !payload.session || !payload.user) {
      if (response.status === 401 && generation === cloudAuthGeneration) {
        const stored = await readCloudSession();
        if (stored?.refreshToken === session.refreshToken && stored.user.id === session.user.id) {
          await clearCloudSession();
          cloudAuthGeneration += 1;
          cloudRefreshFlight = null;
        }
      }
      throw new Error(payload.error || 'Your Rmango cloud session expired. Please sign in again.');
    }

    if (generation !== cloudAuthGeneration) {
      throw new Error('Your Rmango account changed while the session was being refreshed. Please retry.');
    }
    if (payload.user.id !== session.user.id) {
      throw new Error('The refreshed account did not match the saved Rmango account. Sign in again.');
    }

    const stored = await readCloudSession();
    if (stored && stored.user.id !== session.user.id) {
      throw new Error('A different Rmango account is now active. The older session was not restored.');
    }
    // Another caller may have already persisted the rotated token. Never overwrite it
    // with an older response from the same account.
    if (stored && stored.refreshToken !== session.refreshToken) return stored;

    const next: CloudSession = {
      ...session,
      accessToken: payload.session.accessToken,
      refreshToken: payload.session.refreshToken,
      expiresAt: payload.session.expiresAt,
      user: payload.user,
    };
    await writeCloudSession(next);
    return next;
  })();

  const flight = { refreshToken: session.refreshToken, generation, promise };
  cloudRefreshFlight = flight;
  try {
    return await promise;
  } catch (error) {
    if (cloudRefreshFlight === flight) cloudRefreshFlight = null;
    throw error;
  }
}

async function getValidCloudSession(): Promise<CloudSession> {
  let session = await readCloudSession();
  if (!session) throw new Error('Sign in to your Rmango account to use cloud AI.');
  if (session.expiresAt && session.expiresAt * 1000 < Date.now() + 90_000) {
    session = await refreshCloudSession(session);
  }
  return session;
}

async function cloudApiRequest<T = any>(route: string, init: RequestInit = {}, authenticated = true): Promise<T> {
  const baseUrl = await getCloudApiBaseUrl();
  if (!baseUrl) throw new Error('Rmango Cloud is not deployed/configured yet. The desktop app will not fall back to local AI.');
  let session = authenticated ? await getValidCloudSession() : null;

  const send = async () => {
    const headers = new Headers(init.headers || {});
    if (!headers.has('content-type') && init.body) headers.set('content-type', 'application/json');
    if (session) headers.set('authorization', 'Bearer ' + session.accessToken);
    return fetch(baseUrl + route, {
      ...init,
      headers,
      signal: init.signal || AbortSignal.timeout(30_000),
    });
  };

  let response = await send();
  if (response.status === 401 && authenticated && session) {
    session = await refreshCloudSession(session);
    response = await send();
  }
  const raw = await response.text();
  let payload: any = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { error: raw.slice(0, 500) }; }
  if (!response.ok) throw new Error(payload.error || payload.message || ('Rmango Cloud returned HTTP ' + response.status + '.'));
  return payload as T;
}

async function cloudSignIn(email: string, password: string) {
  const previousSession = await readCloudSession();
  resetCloudAuthRefreshState();
  const payload = await cloudApiRequest<any>('/api/auth/sign-in', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }, false);
  const sameAccount = Boolean(previousSession && previousSession.user.id === payload.user.id);
  if (previousSession && !sameAccount && previousSession.studioConnectorId) {
    await disconnectCloudStudioConnector().catch(() => undefined);
  }
  const session: CloudSession = {
    accessToken: payload.session.accessToken,
    refreshToken: payload.session.refreshToken,
    expiresAt: payload.session.expiresAt,
    user: payload.user,
    ...(sameAccount ? {
      currentProjectId: previousSession?.currentProjectId,
      currentConversationId: previousSession?.currentConversationId,
    } : {}),
  };
  await writeCloudSession(session);
  if (mcpClient) {
    await discoverStudioInstances().catch(() => []);
    if (selectedStudioId) await registerCloudStudioConnector().catch(() => undefined);
  }
  return { ok: true, user: session.user };
}

async function cloudRequestPasswordReset(email: string) {
  return cloudApiRequest<{ ok: boolean; message: string }>('/api/auth/password-reset', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }, false);
}

type PublicAuthConfiguration = {
  supabaseUrl: string;
  publishableKey: string;
  providers?: { google?: boolean | null };
};

function callbackPage(response: import('node:http').ServerResponse, status: number, heading: string, message: string) {
  response.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store, max-age=0',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
  });
  response.end(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Rmango sign-in</title><body style="margin:0;background:#101714;color:#eff5ee;font:16px Segoe UI,system-ui,sans-serif;display:grid;min-height:100vh;place-items:center">' +
    '<main style="max-width:440px;padding:36px;text-align:center"><div style="color:#eac15b;font-size:12px;font-weight:800;letter-spacing:2px">RMANGO</div>' +
    '<h1 style="font-size:25px">' + heading + '</h1><p style="color:#b5c2b8;line-height:1.6">' + message + '</p>' +
    '<p style="color:#89998e;font-size:13px">You can close this browser tab and return to the Rmango desktop app.</p></main></body></html>',
  );
}

async function cloudSignInWithGoogle() {
  if (pendingGoogleOAuth) throw new Error('A Google sign-in is already in progress.');

  const configuration = await cloudApiRequest<PublicAuthConfiguration>('/api/auth/config', {}, false);
  if (!configuration || typeof configuration.supabaseUrl !== 'string' ||
      typeof configuration.publishableKey !== 'string' || !configuration.publishableKey) {
    throw new Error('Google sign-in is not configured for this Rmango build.');
  }
  const supabaseUrl = new URL(configuration.supabaseUrl);
  if (supabaseUrl.protocol !== 'https:' || supabaseUrl.username || supabaseUrl.password) {
    throw new Error('The configured Supabase authentication endpoint is not a trusted HTTPS URL.');
  }
  if (configuration.providers?.google === false) {
    throw new Error('Google sign-in is not enabled for Rmango yet. Enable Google under Supabase Authentication → Providers.');
  }

  // Supabase stores its PKCE verifier in this private, per-attempt memory store.
  // The verifier never enters the renderer, browser URL, disk, or application logs.
  const pkceStorage = new Map<string, string>();
  const authClient = createClient(supabaseUrl.origin, configuration.publishableKey, {
    auth: {
      flowType: 'pkce',
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      storage: {
        getItem: (key: string) => pkceStorage.get(key) ?? null,
        setItem: (key: string, value: string) => { pkceStorage.set(key, value); },
        removeItem: (key: string) => { pkceStorage.delete(key); },
      },
    },
  });

  const state = randomBytes(32).toString('base64url');
  const callbackUrl = new URL(GOOGLE_OAUTH_CALLBACK_PATH, GOOGLE_OAUTH_CALLBACK_ORIGIN);
  callbackUrl.searchParams.set('state', state);

  const server = createServer();
  let callbackHandled = false;
  let settled = false;
  let timeout: NodeJS.Timeout | undefined;
  let resolveCompletion!: (value: { ok: true; user: { id: string; email?: string } }) => void;
  let rejectCompletion!: (error: Error) => void;
  const completion = new Promise<{ ok: true; user: { id: string; email?: string } }>((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });
  // The OAuth callback can fail before the code reaches the await below.
  // Attach a handler immediately so an early failure is never an unhandled rejection.
  void completion.catch(() => undefined);

  const cleanup = () => {
    if (timeout) clearTimeout(timeout);
    if (pendingGoogleOAuth === attempt) pendingGoogleOAuth = null;
    if (server.listening) server.close();
    pkceStorage.clear();
  };
  const fail = (error: Error) => {
    if (settled) return;
    settled = true;
    cleanup();
    rejectCompletion(error);
  };
  const succeed = (user: { id: string; email?: string }) => {
    if (settled) return;
    settled = true;
    cleanup();
    resolveCompletion({ ok: true, user });
  };
  const attempt = { cancel: () => fail(new Error('Google sign-in was cancelled.')) };
  pendingGoogleOAuth = attempt;

  server.on('request', (request, response) => {
    if (!isValidGoogleOAuthCallback({
      method: request.method,
      url: request.url,
      host: request.headers.host,
      remoteAddress: request.socket.remoteAddress,
    }, state)) {
      callbackPage(response, 400, 'Invalid sign-in callback', 'This request did not match the active Rmango sign-in attempt.');
      return;
    }
    if (callbackHandled || settled) {
      callbackPage(response, 409, 'Sign-in already processed', 'Return to Rmango and check your account status.');
      return;
    }
    callbackHandled = true;

    const callback = new URL(request.url || '/', GOOGLE_OAUTH_CALLBACK_ORIGIN);
    const authorizationCode = callback.searchParams.get('code');
    if (!authorizationCode) {
      const providerError = callback.searchParams.get('error');
      const message = providerError === 'access_denied'
        ? 'Google sign-in was cancelled.'
        : 'Google did not return a valid authorization code. Start sign-in again from Rmango.';
      callbackPage(response, 400, 'Sign-in was not completed', message);
      fail(new Error(message));
      return;
    }

    void (async () => {
      const { data, error } = await authClient.auth.exchangeCodeForSession(authorizationCode);
      if (error || !data.session) {
        throw new Error(error?.message || 'Google authorization could not be exchanged for an Rmango session.');
      }

      const { data: verified, error: verifyError } = await authClient.auth.getUser(data.session.access_token);
      if (verifyError || !verified.user || verified.user.id !== data.session.user.id) {
        throw new Error('Google sign-in could not verify the returned Rmango account.');
      }

      const previousSession = await readCloudSession();
      const sameAccount = Boolean(previousSession && previousSession.user.id === verified.user.id);
      if (previousSession && !sameAccount && previousSession.studioConnectorId) {
        await disconnectCloudStudioConnector().catch(() => undefined);
      }

      resetCloudAuthRefreshState();
      const session: CloudSession = {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
        user: { id: verified.user.id, email: verified.user.email },
        ...(sameAccount ? {
          currentProjectId: previousSession?.currentProjectId,
          currentConversationId: previousSession?.currentConversationId,
        } : {}),
      };
      await writeCloudSession(session);
      if (mcpClient) {
        await discoverStudioInstances().catch(() => []);
        if (selectedStudioId) await registerCloudStudioConnector().catch(() => undefined);
      }

      callbackPage(response, 200, 'You’re signed in', 'Google authentication was successful.');
      mainWindow?.show();
      mainWindow?.focus();
      succeed(session.user);
    })().catch(error => {
      callbackPage(response, 500, 'Sign-in could not be completed', 'Rmango could not verify this Google sign-in. Return to the app and try again.');
      fail(error instanceof Error ? error : new Error('Google sign-in failed.'));
    });
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: NodeJS.ErrnoException) => {
        server.off('listening', onListening);
        if (error.code === 'EADDRINUSE') {
          reject(new Error('The local Google sign-in callback port is already in use. Close another Rmango instance and retry.'));
        } else {
          reject(error);
        }
      };
      const onListening = () => {
        server.off('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(43821, '127.0.0.1');
    });
    server.on('error', error => fail(error));

    timeout = setTimeout(() => {
      fail(new Error('Google sign-in timed out. Return to Rmango and start again.'));
    }, 5 * 60 * 1000);

    const { data, error } = await authClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl.toString(),
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error || !data.url) {
      throw new Error(error?.message || 'Rmango could not start Google sign-in.');
    }

    const authorizationUrl = new URL(data.url);
    if (authorizationUrl.protocol !== 'https:' ||
        authorizationUrl.origin !== supabaseUrl.origin ||
        !authorizationUrl.pathname.endsWith('/auth/v1/authorize')) {
      throw new Error('Supabase returned an unexpected Google authorization URL.');
    }

    await shell.openExternal(authorizationUrl.toString());
    return await completion;
  } catch (error) {
    fail(error instanceof Error ? error : new Error('Google sign-in failed.'));
    throw error;
  } finally {
    if (!settled) fail(new Error('Google sign-in was closed.'));
  }
}

function cloudCancelGoogleSignIn() {
  if (!pendingGoogleOAuth) return { ok: false, message: 'No Google sign-in is in progress.' };
  pendingGoogleOAuth.cancel();
  return { ok: true };
}

async function cloudSignUp(email: string, password: string, displayName?: string) {
  resetCloudAuthRefreshState();
  const payload = await cloudApiRequest<any>('/api/auth/sign-up', {
    method: 'POST',
    body: JSON.stringify({ email, password, displayName }),
  }, false);
  if (!payload.session) return { ok: true, requiresEmailConfirmation: true, user: payload.user };
  const session: CloudSession = {
    accessToken: payload.session.accessToken,
    refreshToken: payload.session.refreshToken,
    expiresAt: payload.session.expiresAt,
    user: payload.user,
  };
  await writeCloudSession(session);
  if (mcpClient) {
    await discoverStudioInstances().catch(() => []);
    if (selectedStudioId) await registerCloudStudioConnector();
  }
  return { ok: true, requiresEmailConfirmation: false, user: session.user };
}

async function cloudSignOut() {
  resetCloudAuthRefreshState();
  const session = await readCloudSession();
  if (session?.studioConnectorId) await disconnectCloudStudioConnector().catch(() => undefined);
  if (session) {
    try { await cloudApiRequest('/api/auth/sign-out', { method: 'POST', body: '{}' }); } catch { /* Always clear local session. */ }
  }
  await clearCloudSession();
  return { ok: true };
}

async function getCloudState() {
  const apiBaseUrl = await getCloudApiBaseUrl();
  const session = await readCloudSession();
  if (!apiBaseUrl) {
    return {
      configured: false,
      signedIn: false,
      accountVerified: false,
      message: 'Cloud backend URL has not been configured in this build.',
    };
  }

  let serviceReady = false;
  let healthError: string | undefined;
  try {
    const health = await cloudApiRequest<any>('/api/health', {}, false);
    const infrastructureReady = health.status === 'ready';
    serviceReady = infrastructureReady && health.aiReady === true;
    if (!infrastructureReady) {
      healthError = health.error || 'Cloud backend needs its database and Vercel AI Gateway to be configured.';
    } else if (!serviceReady) {
      healthError = health.error || 'Cloud AI inference is not enabled for this deployment.';
    }
  } catch (error) {
    healthError = error instanceof Error ? error.message : 'Cloud backend is unavailable.';
  }

  let signedIn = false;
  let accountVerified = false;
  let email: string | undefined;
  let displayName: string | undefined;
  let emailVerified: boolean | undefined;
  if (session) {
    try {
      const account = await cloudApiRequest<any>('/api/auth/me', {}, true);
      if (!account.user || account.user.id !== session.user.id) {
        throw new Error('The active Rmango account did not match the saved session.');
      }
      signedIn = true;
      accountVerified = true;
      email = typeof account.user.email === 'string' ? account.user.email : session.user.email;
      displayName = typeof account.user.displayName === 'string' ? account.user.displayName : undefined;
      emailVerified = account.user.emailVerified === true;
    } catch (error) {
      const stillSaved = await readCloudSession();
      signedIn = Boolean(stillSaved);
      email = stillSaved?.user.email;
      if (!signedIn && !healthError) {
        healthError = 'Your saved Rmango session is no longer valid. Sign in again.';
      } else if (signedIn && !healthError) {
        healthError = error instanceof Error
          ? 'Account verification is temporarily unavailable: ' + error.message
          : 'Account verification is temporarily unavailable.';
      }
    }
  }

  const latestSession = await readCloudSession();
  return {
    configured: true,
    serviceReady,
    signedIn,
    accountVerified,
    email,
    displayName,
    emailVerified,
    apiHost: new URL(apiBaseUrl).host,
    message: healthError,
    currentProjectId: latestSession?.currentProjectId,
    currentConversationId: latestSession?.currentConversationId,
  };
}

async function getCloudModels() {
  return cloudApiRequest<any>('/api/models', {}, true);
}

async function getCloudUsage() {
  return cloudApiRequest<any>('/api/usage', {}, true);
}

async function listCloudConversations(projectId?: string): Promise<CloudConversation[]> {
  const query = projectId ? '?projectId=' + encodeURIComponent(projectId) : '';
  const result = await cloudApiRequest<{ conversations: CloudConversation[] }>('/api/conversations' + query, {}, true);
  return Array.isArray(result.conversations) ? result.conversations : [];
}

function mapCloudMessage(row: any): ChatMessage | null {
  if (!row || (row.role !== 'user' && row.role !== 'assistant')) return null;
  const stored = row.content && typeof row.content === 'object'
    ? row.content as Record<string, unknown>
    : {};
  const content = typeof stored.text === 'string'
    ? stored.text
    : typeof row.content === 'string' ? row.content : '';
  const attachments = Array.isArray(stored.attachments)
    ? stored.attachments.flatMap((item: any) => {
        if (!item || typeof item !== 'object' || typeof item.name !== 'string') return [];
        const kind: 'image' | 'file' = item.kind === 'image' ? 'image' : 'file';
        return [{
          id: randomUUID(),
          name: item.name.slice(0, 200),
          mimeType: typeof item.mimeType === 'string' ? item.mimeType.slice(0, 100) : 'application/octet-stream',
          kind,
          size: Math.max(0, Number(item.size) || 0),
        }];
      })
    : undefined;
  return {
    id: typeof row.id === 'string' ? row.id : randomUUID(),
    role: row.role,
    content,
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    modelProfile: typeof row.model_profile === 'string' ? row.model_profile as CloudProfile : undefined,
    attachments: attachments?.length ? attachments : undefined,
  };
}

async function listCloudTasks(projectId?: string): Promise<CloudAgentTask[]> {
  const query = projectId ? '?projectId=' + encodeURIComponent(projectId) : '';
  const result = await cloudApiRequest<{ tasks: CloudAgentTask[] }>('/api/tasks' + query, {}, true);
  return Array.isArray(result.tasks) ? result.tasks : [];
}

async function listCloudProjects(): Promise<CloudProject[]> {
  const result = await cloudApiRequest<{ projects: CloudProject[] }>('/api/projects', {}, true);
  return Array.isArray(result.projects) ? result.projects : [];
}

async function createCloudProject(payload: { name: string; description?: string }): Promise<CloudProject> {
  const result = await cloudApiRequest<{ project: CloudProject }>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, true);
  return result.project;
}

async function updateCloudProject(projectId: string, payload: { name?: string; description?: string }): Promise<CloudProject> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
    throw new Error('Invalid cloud project ID.');
  }
  const result = await cloudApiRequest<{ project: CloudProject }>('/api/projects/' + encodeURIComponent(projectId), {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, true);
  return result.project;
}

async function deleteCloudProject(projectId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
    throw new Error('Invalid cloud project ID.');
  }
  const result = await cloudApiRequest<{ ok: boolean; deletedProjectId: string; deletedFileCount: number }>(
    '/api/projects/' + encodeURIComponent(projectId),
    { method: 'DELETE' },
    true,
  );
  const session = await readCloudSession();
  if (session?.currentProjectId === projectId) {
    const next = { ...session };
    delete next.currentProjectId;
    await writeCloudSession(next);
  }
  return result;
}

async function loadCloudConversation(conversationId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conversationId)) {
    throw new Error('Invalid conversation ID.');
  }
  const result = await cloudApiRequest<{ conversation: CloudConversation; messages: any[] }>(
    '/api/conversations/' + encodeURIComponent(conversationId), {}, true,
  );
  const messages = (result.messages || []).map(mapCloudMessage).filter((item): item is ChatMessage => Boolean(item));
  return { conversation: result.conversation, messages };
}

async function createCloudConversation(payload: { title?: string; projectId?: string; modelProfile: CloudProfile }) {
  const result = await cloudApiRequest<{ conversation: CloudConversation }>('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({
      title: (payload.title || 'New chat').slice(0, 80),
      projectId: payload.projectId || null,
      modelProfile: payload.modelProfile,
    }),
  }, true);
  const session = await readCloudSession();
  if (session) {
    const updatedSession = { ...session, currentConversationId: result.conversation.id };
    if (payload.projectId) updatedSession.currentProjectId = payload.projectId;
    else delete updatedSession.currentProjectId;
    await writeCloudSession(updatedSession);
  }
  return result.conversation;
}

async function setCurrentCloudProject(projectId?: string | null) {
  if (projectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
    throw new Error('Invalid cloud project ID.');
  }
  const session = await readCloudSession();
  if (!session) return { ok: false };
  const next = { ...session };
  if (projectId) next.currentProjectId = projectId;
  else delete next.currentProjectId;
  await writeCloudSession(next);
  return { ok: true };
}

async function setCurrentCloudConversation(conversationId?: string | null) {
  if (conversationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conversationId)) {
    throw new Error('Invalid conversation ID.');
  }
  const session = await readCloudSession();
  if (!session) return { ok: false };
  const next = { ...session };
  if (conversationId) next.currentConversationId = conversationId;
  else delete next.currentConversationId;
  await writeCloudSession(next);
  return { ok: true };
}

async function sendCloudMessage(payload: {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  attachments?: Attachment[];
  profile: CloudProfile;
  projectId?: string;
  conversationId?: string;
  requestId?: string;
}) {
  const requestId = typeof payload.requestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.requestId)
    ? payload.requestId
    : randomUUID();
  if (activeChatRequests.has(requestId)) throw new Error('That chat request is already running.');

  const controller = new AbortController();
  activeChatRequests.set(requestId, controller);
  const timeout = setTimeout(() => controller.abort(new Error('The cloud request timed out after 125 seconds. Try a smaller task or check your connection.')), 125_000);
  timeout.unref?.();

  try {
    const session = await getValidCloudSession();
    const baseUrl = await getCloudApiBaseUrl();
    if (controller.signal.aborted) throw controller.signal.reason || new Error('The cloud request was cancelled.');
    if (!baseUrl) throw new Error('The Rmango cloud backend is not configured.');

    const response = await fetch(baseUrl + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + session.accessToken },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const responseConversationId = response.headers.get('X-Rmango-Conversation-Id');
    if (responseConversationId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(responseConversationId)) {
      const latest = await readCloudSession();
      if (latest?.user.id === session.user.id) {
        await writeCloudSession({ ...latest, currentConversationId: responseConversationId });
      }
    }
    if (!response.ok) {
      const raw = await response.text();
      let message = raw;
      try { const parsed = JSON.parse(raw); message = parsed.error || parsed.message || raw; } catch { /* text error */ }
      if (response.status === 401) throw new Error('Your Rmango cloud session expired. Sign in again.');
      if (response.status === 429) throw new Error(message || 'Your Rmango cloud usage limit has been reached.');
      throw new Error(message || ('Rmango Cloud returned HTTP ' + response.status + '.'));
    }
    if (!response.body) throw new Error('The cloud AI returned an empty stream.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const isEventStream = response.headers.get('X-Rmango-Stream-Protocol') === 'ndjson-v1';
    let content = '';
    let buffer = '';
    const activityById = new Map<string, ActivityItem>();

    const emitDelta = (delta: string) => {
      if (!delta) return;
      content += delta;
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send('cloud:chat-delta', { requestId, delta });
      }
    };

    const emitActivity = (value: any) => {
      if (!value || typeof value !== 'object' || typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.detail !== 'string') return;
      const statuses = ['running', 'completed', 'failed', 'cancelled'] as const;
      const status = statuses.includes(value.status) ? value.status : (value.ok === false ? 'failed' : 'completed');
      const item: ActivityItem = {
        id: value.id.slice(0, 180),
        name: value.name.slice(0, 120),
        detail: value.detail.slice(0, 500),
        status,
        ok: status === 'completed',
      };
      activityById.set(item.id!, item);
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send('cloud:chat-activity', { requestId, activity: item });
      }
    };

    const consumeFrame = (line: string) => {
      if (!line.trim()) return;
      let event: any;
      try { event = JSON.parse(line); }
      catch { throw new Error('The cloud AI stream contained an invalid event. Update RMango and try again.'); }
      if (event.type === 'text' && typeof event.text === 'string') {
        emitDelta(event.text);
      } else if (event.type === 'activity') {
        emitActivity(event.activity);
      } else if (event.type === 'error') {
        throw new Error(typeof event.message === 'string' ? event.message : 'The cloud AI stream failed.');
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const decoded = decoder.decode(value, { stream: true });
        if (!isEventStream) { emitDelta(decoded); continue; }
        buffer += decoded;
        let newline = buffer.indexOf(String.fromCharCode(10));
        while (newline >= 0) {
          consumeFrame(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf(String.fromCharCode(10));
        }
      }
      const finalChunk = decoder.decode();
      if (isEventStream) {
        buffer += finalChunk;
        if (buffer.trim()) consumeFrame(buffer);
      } else {
        emitDelta(finalChunk);
      }
    } catch (error) {
      void reader.cancel().catch(() => undefined);
      throw error;
    }
    const preferences = await readSettings();
    if (preferences.desktopNotifications && Notification.isSupported() && (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isFocused() || mainWindow.isMinimized())) {
      new Notification({ title: 'Rmango response ready', body: 'Your Roblox development response has finished.' }).show();
    }
    const returnedProfile = response.headers.get('X-Rmango-Model-Profile') as CloudProfile | null;
    const allowedProfiles: CloudProfile[] = ['fast', 'developer', 'think', 'vision', 'agent'];
    return {
      requestId,
      content,
      conversationId: response.headers.get('X-Rmango-Conversation-Id') || payload.conversationId || undefined,
      modelId: response.headers.get('X-Rmango-Model') || undefined,
      profile: returnedProfile && allowedProfiles.includes(returnedProfile) ? returnedProfile : payload.profile,
      activity: Array.from(activityById.values()),
    };
  } catch (error) {
    if (controller.signal.aborted) {
      const reason = controller.signal.reason;
      throw reason instanceof Error ? reason : new Error('The cloud request was cancelled.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (activeChatRequests.get(requestId) === controller) activeChatRequests.delete(requestId);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0c1711',
    title: 'Rmango',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault();
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  if (!app.isPackaged) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
  mainWindow.on('closed', () => { mainWindow = null; });
}

function isTrustedRendererUrl(candidate: string) {
  try {
    if (!app.isPackaged) {
      const expected = new URL(process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173');
      const actual = new URL(candidate);
      return actual.origin === expected.origin;
    }
    const actualPath = path.resolve(fileURLToPath(candidate));
    const expectedPath = path.resolve(path.join(__dirname, '../dist/index.html'));
    return actualPath.toLowerCase() === expectedPath.toLowerCase();
  } catch {
    return false;
  }
}

function isTrustedIpcSender(event: IpcMainInvokeEvent) {
  const window = mainWindow;
  const frame = event.senderFrame;
  return Boolean(
    window &&
    !window.isDestroyed() &&
    event.sender === window.webContents &&
    frame &&
    frame === window.webContents.mainFrame &&
    isTrustedRendererUrl(frame.url)
  );
}

function handleIpc(channel: string, handler: (event: IpcMainInvokeEvent, ...args: any[]) => any) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedIpcSender(event)) throw new Error('Blocked IPC request from an untrusted renderer.');
    return handler(event, ...args);
  });
}

function getStudioProcessEnvironment(): Record<string, string> {
  // The Roblox MCP child only needs Windows process/location variables.
  // Do not forward unrelated environment values that may contain developer tokens.
  const allowed = new Set([
    "path", "localappdata", "appdata", "userprofile", "systemroot", "windir",
    "temp", "tmp", "homedrive", "homepath", "programdata", "comspec",
    "pathext", "public", "username", "userdomain",
  ]);
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value && allowed.has(key.toLowerCase()) && value.length <= 32_768) environment[key] = value;
  }
  if (!Object.keys(environment).some(key => key.toLowerCase() === "path")) {
    throw new Error("The Windows PATH variable is unavailable; Roblox Studio MCP cannot be started safely.");
  }
  return environment;
}

async function connectRoblox() {
  if (mcpClient) {
    try { await discoverStudioInstances(); }
    catch { /* The bridge may connect before Studio has opened a place. */ }
    const savedSession = await readCloudSession();
    const alreadyLinked = Boolean(savedSession?.studioConnectorId && savedSession.studioConnectorSecret);
    const cloudLink = selectedStudioId
      ? alreadyLinked
        ? (startStudioConnectorPolling(), { linked: true, message: "The cloud connector is linked and command polling is active." })
        : await registerCloudStudioConnector().catch(error => ({
            linked: false,
            message: error instanceof Error ? error.message : "Could not link the Studio connector to cloud.",
          }))
      : { linked: false, message: "MCP bridge connected. Open a place in Roblox Studio, then choose Refresh Studio connection." };
    return {
      ok: true,
      connected: true,
      studioReady: Boolean(selectedStudioId),
      studioId: selectedStudioId,
      studioInstances,
      toolCount: safeToolList().length,
      cloudLinked: cloudLink.linked,
      cloudMessage: cloudLink.message,
    };
  }
  if (process.platform !== 'win32') {
    return { ok: false, connected: false, studioReady: false, error: 'The bundled Roblox Studio MCP connection is configured for Windows.' };
  }
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return { ok: false, connected: false, studioReady: false, error: 'Windows LOCALAPPDATA was not found.' };
  const mcpBat = path.join(localAppData, 'Roblox', 'mcp.bat');
  if (!existsSync(mcpBat)) {
    return {
      ok: false,
      connected: false,
      studioReady: false,
      error: 'Roblox MCP launcher was not found at ' + mcpBat + '. Update Roblox Studio, then enable Assistant → Manage MCP Servers → Enable Studio as MCP server.',
    };
  }
  try {
    const transport = new StdioClientTransport({
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', '"' + mcpBat + '"'],
      env: getStudioProcessEnvironment(),
    });
    const client = new Client({ name: 'rmango-desktop', version: app.getVersion() }, { capabilities: {} });
    await client.connect(transport);
    const result = await client.listTools();
    mcpClient = client;
    mcpTransport = transport;
    connectedTools = result.tools as McpTool[];
    await discoverStudioInstances().catch(() => []);
    const cloudLink = selectedStudioId
      ? await registerCloudStudioConnector().catch(error => ({
          linked: false,
          message: error instanceof Error ? error.message : "Could not link the Studio connector to cloud.",
        }))
      : { linked: false, message: "MCP bridge connected. Open a place in Roblox Studio, then choose Refresh Studio connection." };
    return {
      ok: true,
      connected: true,
      studioReady: Boolean(selectedStudioId),
      toolCount: connectedTools.length,
      tools: connectedTools.map(tool => tool.name),
      studioId: selectedStudioId,
      studioInstances,
      cloudLinked: cloudLink.linked,
      cloudMessage: cloudLink.message,
    };
  } catch (error) {
    mcpClient = null;
    mcpTransport = null;
    connectedTools = [];
    selectedStudioId = undefined;
    studioInstances = [];
    return { ok: false, connected: false, studioReady: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function disconnectRoblox() {
  await disconnectCloudStudioConnector().catch(() => undefined);
  for (const [requestId, resolve] of approvalResolvers) {
    resolve(false);
    approvalResolvers.delete(requestId);
  }
  try { await mcpClient?.close(); } catch { /* connection may already have exited */ }
  try { await mcpTransport?.close(); } catch { /* connection may already have exited */ }
  mcpClient = null;
  mcpTransport = null;
  connectedTools = [];
  selectedStudioId = undefined;
  studioInstances = [];
  return { ok: true, connected: false, studioReady: false };
}

const READ_ONLY_STUDIO_TOOLS = new Set([
  'list_roblox_studios', 'get_studio_state', 'script_read', 'script_search',
  'script_grep', 'search_game_tree', 'inspect_instance', 'get_console_output',
  'screen_capture', 'http_get', 'skill', 'list_skills', 'search_asset',
  'wait_job_finished', 'store_image',
]);

const APPROVAL_REQUIRED_STUDIO_TOOLS = new Set([
  'multi_edit', 'execute_luau', 'generate_mesh', 'generate_material', 'generate_texture',
  'generate_procedural_model', 'generate_scene', 'generate_animation', 'generate_avatar',
  'auto_setup_avatar', 'segment_mesh', 'insert_asset', 'upload_image', 'start_stop_play',
  'character_navigation', 'user_keyboard_input', 'user_mouse_input', 'save_place',
  'subagent', 'open_cloud_invoke', 'create_skill', 'edit_skill',
]);

function mcpAvailable(): boolean {
  return Boolean(mcpClient && mcpTransport);
}

function safeToolList() {
  return connectedTools.filter(tool =>
    READ_ONLY_STUDIO_TOOLS.has(tool.name) || APPROVAL_REQUIRED_STUDIO_TOOLS.has(tool.name)
  );
}

function tryParseJson(value: string): any {
  try { return JSON.parse(value); } catch { return undefined; }
}

function collectStudioInstances(value: any, found = new Map<string, StudioInstance>(), depth = 0): StudioInstance[] {
  if (!value || typeof value !== "object" || depth > 12) return [...found.values()];
  if (Array.isArray(value)) {
    for (const item of value) collectStudioInstances(item, found, depth + 1);
    return [...found.values()];
  }

  const idValue = typeof value.studio_id === "string" ? value.studio_id
    : typeof value.studioId === "string" ? value.studioId
    : typeof value.instance_id === "string" ? value.instance_id
    : undefined;
  if (idValue) {
    const nameValue = [value.name, value.studio_name, value.studioName, value.place_name, value.placeName]
      .find(item => typeof item === "string" && item.trim());
    const placeValue = typeof value.place_id === "string" ? value.place_id
      : typeof value.placeId === "string" || typeof value.placeId === "number" ? String(value.placeId)
      : undefined;
    found.set(idValue, {
      id: idValue.slice(0, 180),
      name: typeof nameValue === "string" ? nameValue.trim().slice(0, 120) : "Roblox Studio",
      placeId: placeValue?.slice(0, 80),
    });
  }
  for (const child of Object.values(value)) collectStudioInstances(child, found, depth + 1);
  return [...found.values()];
}

async function discoverStudioInstances(): Promise<StudioInstance[]> {
  if (!mcpClient || !connectedTools.some(tool => tool.name === "list_roblox_studios")) {
    studioInstances = [];
    selectedStudioId = undefined;
    return [];
  }
  const result = await mcpClient.callTool({ name: "list_roblox_studios", arguments: {} });
  const found = new Map<string, StudioInstance>();
  collectStudioInstances((result as any).structuredContent, found);
  for (const item of (result as any).content || []) {
    if (item?.type !== "text" || typeof item.text !== "string") continue;
    const parsed = tryParseJson(item.text);
    if (parsed) collectStudioInstances(parsed, found);
  }
  studioInstances = [...found.values()];
  if (!studioInstances.some(instance => instance.id === selectedStudioId)) {
    selectedStudioId = studioInstances[0]?.id;
  }
  return studioInstances;
}

function withStudioId(tool: McpTool, input: Record<string, unknown>) {
  if (tool.name === 'list_roblox_studios' || !selectedStudioId) return input;
  // Roblox Studio MCP scopes calls to one open Studio instance via studio_id.
  // Keep the selected ID authoritative rather than allowing a model-supplied ID.
  return { ...input, studio_id: selectedStudioId };
}

async function requestStudioApproval(name: string, description: string, args: Record<string, unknown>) {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('Rmango window is not available for the approval prompt.');
  const requestId = randomUUID();
  const safeArgs = JSON.parse(JSON.stringify(args, (_key, value) => {
    if (typeof value === 'string' && value.length > 5_000) return value.slice(0, 5_000) + '… [truncated]';
    return value;
  }));
  const request: ApprovalRequest = { requestId, name, description, arguments: safeArgs };
  mainWindow.webContents.send('studio:approval-request', request);
  const approved = await new Promise<boolean>(resolve => {
    const timeout = setTimeout(() => {
      approvalResolvers.delete(requestId);
      resolve(false);
    }, APPROVAL_TIMEOUT_MS);
    approvalResolvers.set(requestId, value => {
      clearTimeout(timeout);
      resolve(value);
    });
  });
  if (!approved) throw new Error('The request for ' + name + ' was not approved. No Studio changes were made.');
}

async function callStudioTool(name: string, args: Record<string, unknown>) {
  if (!mcpClient) throw new Error('Roblox Studio is not connected.');
  const tool = connectedTools.find(item => item.name === name);
  if (!tool || (!READ_ONLY_STUDIO_TOOLS.has(name) && !APPROVAL_REQUIRED_STUDIO_TOOLS.has(name))) {
    throw new Error('Tool ' + name + ' is not enabled in Rmango.');
  }
  if (name !== 'list_roblox_studios' && !selectedStudioId) {
    throw new Error('The Roblox MCP bridge is running, but no open Studio place is selected. Open your place in Roblox Studio, then refresh the Studio connection.');
  }
  if (APPROVAL_REQUIRED_STUDIO_TOOLS.has(name)) {
    await requestStudioApproval(name, tool.description || ('This action will run ' + name + ' in the connected Roblox Studio session.'), args);
  }
  const result = await mcpClient.callTool({ name, arguments: withStudioId(tool, args) });
  if ((result as any).isError) throw new Error(JSON.stringify((result as any).content || result).slice(0, 2_000));
  return result;
}

async function registerCloudStudioConnector() {
  if (!mcpClient) return { linked: false, message: "Roblox Studio MCP bridge is not connected." };
  if (!selectedStudioId) return { linked: false, message: "The MCP bridge is online, but no open Roblox Studio place was detected. Open a place and refresh the Studio connection." };
  const session = await readCloudSession();
  if (!session) return { linked: false, message: "Sign in to Rmango Cloud to link the Studio connector." };
  const tools = safeToolList().map(tool => ({
    name: tool.name,
    description: tool.description || "",
    inputSchema: tool.inputSchema || { type: "object", properties: {} },
  }));
  if (!tools.length) return { linked: false, message: "No supported Studio tools were discovered." };

  const registered = await cloudApiRequest<any>("/api/studio/register", {
    method: "POST",
    body: JSON.stringify({ connectorName: "Rmango Desktop · " + app.getVersion(), tools }),
  });
  const nextSession: CloudSession = {
    ...session,
    studioConnectorId: registered.connectorId,
    studioConnectorSecret: registered.connectorSecret,
  };
  await writeCloudSession(nextSession);
  startStudioConnectorPolling();
  return { linked: true, toolCount: registered.toolCount || tools.length };
}

function stopStudioConnectorPolling() {
  if (studioPollTimer) {
    clearInterval(studioPollTimer);
    studioPollTimer = null;
  }
  studioPollInFlight = false;
}

function startStudioConnectorPolling() {
  stopStudioConnectorPolling();
  studioPollTimer = setInterval(() => { void pollCloudStudioCommands(); }, 1_400);
  studioPollTimer.unref?.();
  void pollCloudStudioCommands();
}

async function pollCloudStudioCommands() {
  if (studioPollInFlight || !mcpClient || !selectedStudioId) return;
  const session = await readCloudSession();
  if (!session?.studioConnectorId || !session.studioConnectorSecret) return;
  studioPollInFlight = true;
  try {
    const response = await cloudApiRequest<any>("/api/studio/poll", {
      method: "POST",
      body: JSON.stringify({
        connectorId: session.studioConnectorId,
        connectorSecret: session.studioConnectorSecret,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    for (const command of (response.commands || []).slice(0, 5)) {
      const toolName = String(command.tool_name || "");
      const args = command.tool_arguments && typeof command.tool_arguments === "object"
        ? command.tool_arguments as Record<string, unknown>
        : {};
      try {
        const result = await callStudioTool(toolName, args);
        await cloudApiRequest("/api/studio/result", {
          method: "POST",
          body: JSON.stringify({
            connectorId: session.studioConnectorId,
            connectorSecret: session.studioConnectorSecret,
            commandId: command.id,
            ok: true,
            result,
          }),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        try {
          await cloudApiRequest("/api/studio/result", {
            method: "POST",
            body: JSON.stringify({
              connectorId: session.studioConnectorId,
              connectorSecret: session.studioConnectorSecret,
              commandId: command.id,
              ok: false,
              error: message,
            }),
          });
        } catch { /* The cloud agent will time out and explain that the connector failed. */ }
      }
    }
  } catch {
    // Temporary disconnects are retried on the next poll; no inference runs here.
  } finally {
    studioPollInFlight = false;
  }
}

async function disconnectCloudStudioConnector() {
  stopStudioConnectorPolling();
  const session = await readCloudSession();
  if (!session?.studioConnectorId || !session.studioConnectorSecret) return;
  try {
    await cloudApiRequest("/api/studio/disconnect", {
      method: "POST",
      body: JSON.stringify({
        connectorId: session.studioConnectorId,
        connectorSecret: session.studioConnectorSecret,
      }),
    });
  } catch { /* Local disconnect must still succeed if the network is unavailable. */ }
  const next = { ...session };
  delete next.studioConnectorId;
  delete next.studioConnectorSecret;
  await writeCloudSession(next);
}

async function projectFiles(root: string, depth = 0): Promise<Array<{ name: string; path: string; kind: 'file' | 'folder' }>> {
  if (depth > 3) return [];
  const ignored = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.next', 'coverage']);
  let entries;
  try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { return []; }
  const result: Array<{ name: string; path: string; kind: 'file' | 'folder' }> = [];
  for (const entry of entries.slice(0, 160)) {
    if (ignored.has(entry.name) || entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push({ name: entry.name, path: fullPath, kind: 'folder' });
      if (depth < 2) result.push(...(await projectFiles(fullPath, depth + 1)).slice(0, 24));
    } else {
      result.push({ name: entry.name, path: fullPath, kind: 'file' });
    }
    if (result.length >= 180) break;
  }
  return result;
}

function insideRoot(root: string, target: string) {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

async function readProjectFile(root: string, relativePath: string) {
  const resolved = path.resolve(root, relativePath);
  const allowed = [
    '.lua', '.luau', '.json', '.md', '.txt', '.toml', '.yaml', '.yml',
    '.js', '.jsx', '.ts', '.tsx', '.css', '.html', '.csv', '.xml',
  ];
  let realRoot: string;
  let realTarget: string;
  try {
    [realRoot, realTarget] = await Promise.all([fs.realpath(root), fs.realpath(resolved)]);
  } catch {
    throw new Error('The selected file no longer exists or cannot be accessed.');
  }
  if (!insideRoot(realRoot, realTarget)) throw new Error('That file resolves outside the selected project folder.');
  if (!allowed.includes(path.extname(realTarget).toLowerCase())) throw new Error('Rmango can only read source and text files in this version.');
  const info = await fs.stat(realTarget);
  if (!info.isFile()) throw new Error('Only regular files can be read.');
  if (info.size > 512_000) throw new Error('File is larger than the 500 KB read limit.');
  return fs.readFile(realTarget, 'utf8');
}

async function getCloudProjectChanges(projectId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) throw new Error("Invalid cloud project ID.");
  return cloudApiRequest<any>("/api/projects/" + projectId + "/changes");
}

async function reviewCloudProjectChange(projectId: string, changeId: string, decision: "approve" | "reject") {
  if (!/^[0-9a-f-]{36}$/i.test(projectId) || !/^[0-9a-f-]{36}$/i.test(changeId)) {
    throw new Error("Invalid cloud project or proposal ID.");
  }
  return cloudApiRequest<any>("/api/projects/" + projectId + "/changes/" + changeId, {
    method: "PATCH",
    body: JSON.stringify({ decision }),
  });
}

async function downloadCloudProjectZip(projectId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) throw new Error("Invalid cloud project ID.");
  let session = await getValidCloudSession();
  const baseUrl = await getCloudApiBaseUrl();
  if (!baseUrl) throw new Error("Rmango Cloud is not configured.");
  const send = () => fetch(baseUrl + "/api/projects/" + projectId + "/download", {
    headers: { authorization: "Bearer " + session.accessToken },
    signal: AbortSignal.timeout(120_000),
  });
  let response = await send();
  if (response.status === 401) {
    session = await refreshCloudSession(session);
    response = await send();
  }
  if (!response.ok) {
    const raw = await response.text();
    let errorMessage = raw;
    try { errorMessage = JSON.parse(raw).error || raw; } catch { /* use response body */ }
    throw new Error(errorMessage || "Could not download the cloud project.");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const disposition = response.headers.get("content-disposition") || "";
  const suggestedName = disposition.match(/filename="([^"]+)"/i)?.[1] || "Rmango-Cloud-Project.zip";
  const picked = await dialog.showSaveDialog({
    title: "Download Rmango Cloud Project",
    defaultPath: path.join(app.getPath("downloads"), suggestedName),
    filters: [{ name: "ZIP archive", extensions: ["zip"] }],
  });
  if (picked.canceled || !picked.filePath) return { canceled: true };
  await fs.writeFile(picked.filePath, bytes);
  return { canceled: false, path: picked.filePath, sizeBytes: bytes.length };
}

async function uploadCloudProject() {
  const settings = await readSettings();
  if (!settings.projectPath) throw new Error("Open a local project folder before syncing it to Rmango Cloud.");
  const session = await getValidCloudSession();
  const root = await fs.realpath(settings.projectPath);
  const localProjectName = path.basename(root) || "Roblox Project";

  let cloudProject: CloudProject | null = null;
  let projectId = session.currentProjectId;
  if (projectId) {
    try {
      const existing = await cloudApiRequest<{ project: CloudProject }>("/api/projects/" + encodeURIComponent(projectId), {}, true);
      if (existing.project?.id === projectId) cloudProject = existing.project;
      else projectId = undefined;
    } catch (error) {
      if (error instanceof Error && /cloud project not found/i.test(error.message)) {
        projectId = undefined;
      } else {
        throw error;
      }
    }
  }

  if (!projectId) {
    const created = await cloudApiRequest<{ project: CloudProject }>("/api/projects", {
      method: "POST",
      body: JSON.stringify({
        name: localProjectName,
        description: "Source files imported from " + localProjectName + " using Rmango Desktop.",
      }),
    });
    if (typeof created.project?.id !== "string") {
      throw new Error("The cloud service did not return a project ID.");
    }
    cloudProject = created.project;
    projectId = created.project.id;
  }

  if (!cloudProject) {
    throw new Error("The selected cloud project could not be verified. No files were uploaded.");
  }
  await writeCloudSession({ ...session, currentProjectId: projectId });

  const remote = await cloudApiRequest<{ files: Array<{
    relative_path: string;
    sha256: string | null;
    size_bytes: number;
  }> }>("/api/projects/" + projectId + "/files", {}, true);
  const remoteByPath = new Map((remote.files || []).map(file => [file.relative_path, file]));
  const allEntries = (await projectFiles(root)).filter(item => item.kind === "file");
  const entries = allEntries.slice(0, 120);
  const scanComplete = allEntries.length <= entries.length;
  const uploaded: string[] = [];
  const unchanged: string[] = [];
  const skipped: Array<{ name: string; reason: string }> = [];

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const relativePath = path.relative(root, entry.path).split(path.sep).join("/");
    try {
      const content = await readProjectFile(root, relativePath);
      const extension = path.extname(entry.name).toLowerCase();
      const mimeType = extension === ".json" ? "application/json" : extension === ".csv" ? "text/csv" : "text/plain";
      const bytes = Buffer.from(content, "utf8");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const existing = remoteByPath.get(relativePath);
      if (existing?.sha256 === sha256) {
        unchanged.push(relativePath);
      } else {
        await cloudApiRequest("/api/projects/" + projectId + "/files", {
          method: "POST",
          body: JSON.stringify({
            relativePath,
            fileName: entry.name,
            mimeType,
            sizeBytes: bytes.length,
            dataBase64: bytes.toString("base64"),
          }),
        });
        uploaded.push(relativePath);
      }
    } catch (error) {
      skipped.push({
        name: relativePath,
        reason: error instanceof Error ? error.message : "File could not be synced.",
      });
    }

    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send("project:upload-progress", {
          projectId,
          completed: index + 1,
          total: entries.length,
          uploaded: uploaded.length,
          skipped: skipped.length,
          currentFile: relativePath,
        });
      }
    }
  }

  let removed = 0;
  // Do not delete cloud files when the local scan was capped or any local
  // read/upload failed; an incomplete scan is not evidence of deletion.
  if (scanComplete && skipped.length === 0) {
    const localPaths = new Set(entries.map(entry => path.relative(root, entry.path).split(path.sep).join("/")));
    const stalePaths = (remote.files || [])
      .map(file => file.relative_path)
      .filter(relativePath => !localPaths.has(relativePath));
    for (let offset = 0; offset < stalePaths.length; offset += 500) {
      const batch = stalePaths.slice(offset, offset + 500);
      const result = await cloudApiRequest<{ removed: number }>("/api/projects/" + projectId + "/files", {
        method: "DELETE",
        body: JSON.stringify({ relativePaths: batch }),
      });
      removed += Number(result.removed) || 0;
    }
  }

  return {
    ok: true,
    projectId,
    projectName: cloudProject.name,
    totalFiles: entries.length,
    uploaded: uploaded.length,
    unchanged: unchanged.length,
    removed,
    skipped,
  };
}

async function runDiagnostics() {
  if (!mcpClient) return { ok: false, error: 'Connect the Roblox Studio MCP bridge first.' };
  try { await discoverStudioInstances(); } catch { /* Report the latest known Studio state below. */ }
  if (!selectedStudioId) {
    return { ok: false, error: 'The MCP bridge is connected, but no open Roblox Studio place was detected. Open a place, then refresh the connection.' };
  }
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
  for (const name of ['list_roblox_studios', 'get_studio_state']) {
    if (!READ_ONLY_STUDIO_TOOLS.has(name) || !connectedTools.some(tool => tool.name === name)) continue;
    try {
      const result = await callStudioTool(name, {});
      checks.push({ name, ok: true, detail: JSON.stringify((result as any).content ?? result).slice(0, 1_800) });
    } catch (error) {
      checks.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
    }
  }
  return { ok: checks.length > 0 && checks.every(check => check.ok), checks };
}

function broadcastUpdateState(next: Partial<AppUpdateState>) {
  appUpdateState = {
    ...appUpdateState,
    ...next,
    currentVersion: app.getVersion(),
  };
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('updates:status', appUpdateState);
  }
}

function formatReleaseNotes(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 4_000);
  if (Array.isArray(value)) {
    return value
      .map(item => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const entry = item as Record<string, unknown>;
          return String(entry.note || entry.version || '');
        }
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .slice(0, 4_000);
  }
  return '';
}

function isNewerStableVersion(candidate: string, current: string): boolean {
  const parse = (version: string) => {
    const cleaned = version.trim().replace(/^v/i, '').split('-')[0];
    if (!/^\d+(?:\.\d+){1,3}$/.test(cleaned)) return null;
    const parts = cleaned.split('.').map(part => Number(part));
    return parts.every(Number.isSafeInteger) ? parts : null;
  };
  const next = parse(candidate);
  const installed = parse(current);
  if (!next || !installed) return false;
  for (let i = 0; i < Math.max(next.length, installed.length); i += 1) {
    const a = next[i] ?? 0;
    const b = installed[i] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}

async function checkForAppUpdates(force = false): Promise<AppUpdateState> {
  if (!app.isPackaged || process.platform !== 'win32') {
    broadcastUpdateState({
      status: 'unsupported',
      message: 'GitHub updates are available in the installed Windows app.',
    });
    return appUpdateState;
  }

  if (updateCheckInFlight || appUpdateState.status === 'downloading' || appUpdateState.status === 'downloaded') return appUpdateState;
  if (!force && Date.now() - lastUpdateCheckAt < 30_000 && appUpdateState.status === 'not-available') return appUpdateState;

  updateCheckInFlight = true;
  lastUpdateCheckAt = Date.now();
  broadcastUpdateState({ status: 'checking', error: undefined, message: 'Checking the latest stable Rmango release…' });

  try {
    const result = await autoUpdater.checkForUpdates();
    const latestVersion = result?.updateInfo?.version;
    if (!result?.isUpdateAvailable || !latestVersion || !isNewerStableVersion(latestVersion, app.getVersion())) {
      broadcastUpdateState({
        status: 'not-available',
        availableVersion: undefined,
        progress: undefined,
        error: undefined,
        message: 'You are already on the latest stable version.',
      });
      return appUpdateState;
    }

    broadcastUpdateState({
      status: 'downloading',
      availableVersion: latestVersion,
      progress: 0,
      error: undefined,
      message: 'Downloading the newest stable version ' + latestVersion + '…',
    });
    await autoUpdater.downloadUpdate();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    broadcastUpdateState({
      status: 'error',
      error: message,
      message: 'Could not check or download the latest stable release.',
    });
  } finally {
    updateCheckInFlight = false;
  }
  return appUpdateState;
}

function initializeAutoUpdates() {
  if (!app.isPackaged || process.platform !== 'win32') {
    broadcastUpdateState({
      status: 'unsupported',
      message: 'Updates are checked by the installed Windows version of Rmango.',
    });
    return;
  }

  // NSIS + electron-updater is the supported Windows self-update path.
  // Downloads happen in the background; installation always waits for the user's click.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.logger = console;

  autoUpdater.on('checking-for-update', () => {
    broadcastUpdateState({ status: 'checking', message: 'Checking GitHub Releases…' });
  });

  autoUpdater.on('update-available', info => {
    broadcastUpdateState({
      status: 'downloading',
      availableVersion: info.version,
      progress: 0,
      message: 'Version ' + info.version + ' is available. Downloading in the background…',
      error: undefined,
    });
  });

  autoUpdater.on('download-progress', progress => {
    broadcastUpdateState({
      status: 'downloading',
      progress: Math.max(0, Math.min(100, progress.percent)),
      message: 'Downloading update… ' + Math.round(progress.percent) + '%',
    });
  });

  autoUpdater.on('update-downloaded', info => {
    broadcastUpdateState({
      status: 'downloaded',
      availableVersion: info.version,
      progress: 100,
      releaseNotes: formatReleaseNotes(info.releaseNotes),
      message: 'Version ' + info.version + ' is ready to install.',
    });
  });

  autoUpdater.on('update-not-available', () => {
    broadcastUpdateState({
      status: 'not-available',
      availableVersion: undefined,
      progress: undefined,
      error: undefined,
      message: 'You are using the latest version.',
    });
  });

  autoUpdater.on('error', error => {
    broadcastUpdateState({
      status: 'error',
      error: error.message,
      message: 'The update check or download failed.',
    });
  });

  void readSettings().then(settings => configureAutoUpdateSchedule(settings.autoUpdatesEnabled));
}

app.whenReady().then(() => {
  createWindow();
  initializeAutoUpdates();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => {
  pendingGoogleOAuth?.cancel(); void disconnectRoblox(); });

handleIpc('app:get-state', async () => {
  const settings = await readSettings();
  const files = settings.projectPath ? await projectFiles(settings.projectPath) : [];
  return {
    appVersion: app.getVersion(),
    platform: process.platform,
    projectPath: settings.projectPath || '',
    projectFiles: files,
    studioConnected: mcpAvailable(),
    studioToolCount: safeToolList().length,
    appearance: settings.appearance,
    density: settings.density,
    animationsEnabled: settings.animationsEnabled,
    reducedMotion: settings.reducedMotion,
    fontSize: settings.fontSize,
    sendOnEnter: settings.sendOnEnter,
    desktopNotifications: settings.desktopNotifications,
    autoUpdatesEnabled: settings.autoUpdatesEnabled,
    defaultCloudProfile: settings.defaultCloudProfile,
    saveLocalChatHistory: settings.saveLocalChatHistory,
    showInspectorByDefault: settings.showInspectorByDefault,
  };
});

handleIpc('settings:update', async (_event, patch: SettingsPatch) => {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid Rmango settings update.');
  const next = await readSettings();
  if ('appearance' in patch) {
    if (patch.appearance !== 'dark' && patch.appearance !== 'light' && patch.appearance !== 'system') throw new Error('Choose Dark, Light, or Device appearance.');
    next.appearance = patch.appearance;
  }
  if ('density' in patch) {
    if (patch.density !== 'comfortable' && patch.density !== 'compact') throw new Error('Choose Comfortable or Compact density.');
    next.density = patch.density;
  }
  if ('animationsEnabled' in patch) {
    if (typeof patch.animationsEnabled !== 'boolean') throw new Error('Animation preference must be on or off.');
    next.animationsEnabled = patch.animationsEnabled;
  }
  if ('reducedMotion' in patch) {
    if (typeof patch.reducedMotion !== 'boolean') throw new Error('Reduced-motion preference must be on or off.');
    next.reducedMotion = patch.reducedMotion;
  }
  if ('fontSize' in patch) {
    if (patch.fontSize !== 'small' && patch.fontSize !== 'medium' && patch.fontSize !== 'large') throw new Error('Choose Small, Medium, or Large text.');
    next.fontSize = patch.fontSize;
  }
  if ('sendOnEnter' in patch) {
    if (typeof patch.sendOnEnter !== 'boolean') throw new Error('Keyboard send preference must be on or off.');
    next.sendOnEnter = patch.sendOnEnter;
  }
  if ('desktopNotifications' in patch) {
    if (typeof patch.desktopNotifications !== 'boolean') throw new Error('Notification preference must be on or off.');
    next.desktopNotifications = patch.desktopNotifications;
  }
  if ('autoUpdatesEnabled' in patch) {
    if (typeof patch.autoUpdatesEnabled !== 'boolean') throw new Error('Automatic update preference must be on or off.');
    next.autoUpdatesEnabled = patch.autoUpdatesEnabled;
  }
  if ('defaultCloudProfile' in patch) {
    if (!['fast', 'developer', 'think', 'vision', 'agent'].includes(String(patch.defaultCloudProfile))) {
      throw new Error('Choose a supported default AI profile.');
    }
    next.defaultCloudProfile = patch.defaultCloudProfile as CloudProfile;
  }
  if ('saveLocalChatHistory' in patch) {
    if (typeof patch.saveLocalChatHistory !== 'boolean') throw new Error('Local chat history preference must be on or off.');
    next.saveLocalChatHistory = patch.saveLocalChatHistory;
  }
  if ('showInspectorByDefault' in patch) {
    if (typeof patch.showInspectorByDefault !== 'boolean') throw new Error('Inspector preference must be on or off.');
    next.showInspectorByDefault = patch.showInspectorByDefault;
  }
  await writeSettings(next);
  if ('saveLocalChatHistory' in patch && !next.saveLocalChatHistory) {
    try { await fs.rm(sessionPath(), { force: true }); } catch { /* cache may not exist */ }
  }
  if ('autoUpdatesEnabled' in patch) await configureAutoUpdateSchedule(next.autoUpdatesEnabled);
  return { ok: true, settings: normaliseSettings(next) };
});

handleIpc('settings:appearance', async (_event, theme: AppearanceTheme) => {
  if (theme !== 'dark' && theme !== 'light' && theme !== 'system') throw new Error('Choose Dark, Light, or Device appearance.');
  const current = await readSettings();
  const next = { ...current, appearance: theme };
  await writeSettings(next);
  return { ok: true, appearance: theme };
});

handleIpc('cloud:state', () => getCloudState());
handleIpc('cloud:usage', () => getCloudUsage());
handleIpc('cloud:sign-in', async (_event, payload: { email: string; password: string }) => {
  if (!payload || typeof payload.email !== 'string' || typeof payload.password !== 'string' ||
      payload.email.length > 254 || payload.password.length > 128) {
    throw new Error('Enter your Rmango account email and password.');
  }
  return cloudSignIn(payload.email, payload.password);
});
handleIpc('cloud:sign-in-google', () => cloudSignInWithGoogle());
handleIpc('cloud:cancel-google-sign-in', () => cloudCancelGoogleSignIn());
handleIpc('cloud:password-reset', async (_event, payload: { email: string }) => {
  if (!payload || typeof payload.email !== 'string') throw new Error('Enter your Rmango account email.');
  return cloudRequestPasswordReset(payload.email);
});
handleIpc('cloud:sign-up', async (_event, payload: { email: string; password: string; displayName?: string }) => {
  if (!payload || typeof payload.email !== 'string' || typeof payload.password !== 'string') {
    throw new Error('Enter an email and password to create a Rmango account.');
  }
  return cloudSignUp(payload.email, payload.password, payload.displayName);
});
handleIpc('cloud:sign-out', () => cloudSignOut());
handleIpc('cloud:models', () => getCloudModels());
handleIpc('cloud:conversations:list', (_event, projectId?: string) => listCloudConversations(projectId));
handleIpc('cloud:tasks:list', (_event, projectId?: string) => listCloudTasks(projectId));
handleIpc('cloud:projects:list', () => listCloudProjects());
handleIpc('cloud:projects:create', (_event, payload: { name: string; description?: string }) => {
  if (!payload || typeof payload.name !== 'string') throw new Error('Enter a project name.');
  return createCloudProject({ name: payload.name, description: payload.description });
});
handleIpc('cloud:projects:update', (_event, payload: { projectId: string; name?: string; description?: string }) => {
  if (!payload || typeof payload.projectId !== 'string') throw new Error('Invalid cloud project update.');
  return updateCloudProject(payload.projectId, { name: payload.name, description: payload.description });
});
handleIpc('cloud:projects:delete', (_event, projectId: string) => deleteCloudProject(projectId));
handleIpc('cloud:conversations:load', (_event, conversationId: string) => loadCloudConversation(conversationId));
handleIpc('cloud:conversations:create', (_event, payload: { title?: string; projectId?: string; modelProfile: CloudProfile }) => {
  const allowedProfiles: CloudProfile[] = ['fast', 'developer', 'think', 'vision', 'agent'];
  if (!payload || !allowedProfiles.includes(payload.modelProfile)) throw new Error('Invalid conversation settings.');
  return createCloudConversation(payload);
});
handleIpc('cloud:project:set-active', (_event, projectId?: string | null) => setCurrentCloudProject(projectId));
handleIpc('cloud:conversation:set-active', (_event, conversationId?: string | null) => setCurrentCloudConversation(conversationId));

handleIpc('project:open', async () => {
  const picked = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  if (picked.canceled || !picked.filePaths[0]) return { canceled: true };
  const root = picked.filePaths[0];
  const settings = await readSettings();
  await writeSettings({ ...settings, projectPath: root });
  return { canceled: false, path: root, files: await projectFiles(root) };
});
handleIpc('project:upload-cloud', () => uploadCloudProject());
handleIpc('project:changes', (_event, projectId: string) => getCloudProjectChanges(projectId));
handleIpc('project:review-change', (_event, payload: { projectId: string; changeId: string; decision: "approve" | "reject" }) => {
  if (!payload || (payload.decision !== "approve" && payload.decision !== "reject")) {
    throw new Error("A valid approve/reject decision is required.");
  }
  return reviewCloudProjectChange(payload.projectId, payload.changeId, payload.decision);
});
handleIpc('project:download-cloud', (_event, projectId: string) => downloadCloudProjectZip(projectId));
handleIpc('project:clear', async () => {
  const settings = await readSettings();
  delete settings.projectPath;
  await writeSettings(settings);
  return { ok: true };
});

handleIpc('mcp:connect', () => connectRoblox());
handleIpc('mcp:disconnect', () => disconnectRoblox());
handleIpc('mcp:state', async () => {
  if (mcpAvailable()) {
    try { await discoverStudioInstances(); } catch { /* Keep the last known session list during a transient MCP error. */ }
  } else {
    studioInstances = [];
    selectedStudioId = undefined;
  }
  const session = await readCloudSession();
  return {
    connected: mcpAvailable(),
    studioReady: Boolean(mcpAvailable() && selectedStudioId),
    cloudLinked: Boolean(session?.studioConnectorId && session.studioConnectorSecret),
    toolCount: safeToolList().length,
    tools: safeToolList().map(tool => tool.name),
    studioId: selectedStudioId || null,
    studioInstances,
  };
});
handleIpc('mcp:select-studio', (_event, studioId: string) => {
  if (typeof studioId !== 'string' || !studioInstances.some(instance => instance.id === studioId)) {
    throw new Error('That Roblox Studio instance is no longer available. Refresh Studio connections and try again.');
  }
  selectedStudioId = studioId;
  return { ok: true, studioId: selectedStudioId, studioReady: true };
});
handleIpc('mcp:list-tools', () => ({
  all: connectedTools.map(tool => ({ name: tool.name, description: tool.description || '' })),
  readOnly: safeToolList().filter(tool => READ_ONLY_STUDIO_TOOLS.has(tool.name)).map(tool => tool.name),
  approvalRequired: safeToolList().filter(tool => APPROVAL_REQUIRED_STUDIO_TOOLS.has(tool.name)).map(tool => tool.name),
}));
handleIpc('mcp:diagnostics', () => runDiagnostics());
handleIpc('studio:approval-result', (_event, response: { requestId: string; approved: boolean }) => {
  const resolve = approvalResolvers.get(response.requestId);
  if (resolve) {
    approvalResolvers.delete(response.requestId);
    resolve(Boolean(response.approved));
    return { ok: true };
  }
  return { ok: false };
});

handleIpc('chat:load', async () => {
  try {
    const preferences = await readSettings();
    if (!preferences.saveLocalChatHistory) {
      try { await fs.rm(sessionPath(), { force: true }); } catch { /* cache may not exist */ }
      return [];
    }
    const filePath = sessionPath();
    const stored = await fs.readFile(filePath, 'utf8');
    if (!safeStorage.isEncryptionAvailable()) return [];

    let parsed: unknown;
    let legacyPlaintext = false;
    try {
      parsed = JSON.parse(safeStorage.decryptString(Buffer.from(stored.trim(), 'base64')));
    } catch {
      // One-time migration for history files created by older RMango versions.
      try {
        parsed = JSON.parse(stored);
        legacyPlaintext = true;
      } catch {
        return [];
      }
    }

    const cloudSession = await readCloudSession();
    const activeOwnerId = cloudSession?.user.id || null;
    let ownerId: string | null = null;
    let messages: unknown;

    if (Array.isArray(parsed)) {
      // Pre-account history is treated as guest-only. It must not appear inside
      // a signed-in account, where it could reveal a previous account's chats.
      ownerId = null;
      messages = parsed;
    } else if (parsed && typeof parsed === 'object') {
      const saved = parsed as { version?: unknown; ownerId?: unknown; messages?: unknown };
      if (saved.version !== 2 || (saved.ownerId !== null && typeof saved.ownerId !== 'string') || !Array.isArray(saved.messages)) {
        return [];
      }
      ownerId = typeof saved.ownerId === 'string' ? saved.ownerId : null;
      messages = saved.messages;
    } else {
      return [];
    }

    if (ownerId !== activeOwnerId) {
      // A legacy unscoped transcript may have belonged to a different signed-in
      // account. Replace it with an empty account-bound cache instead of showing it.
      if (activeOwnerId && ownerId === null) {
        const encrypted = safeStorage.encryptString(JSON.stringify({
          version: 2,
          ownerId: activeOwnerId,
          messages: [],
        })).toString('base64');
        const temporaryPath = filePath + '.migrating';
        await fs.writeFile(temporaryPath, encrypted, { encoding: 'utf8', mode: 0o600 });
        await fs.rename(temporaryPath, filePath);
      }
      return [];
    }
    const cleaned = (messages as ChatMessage[]).filter(message =>
      message && (message.role === 'user' || message.role === 'assistant') &&
      typeof message.content === 'string'
    ).slice(-100);

    if (legacyPlaintext || Array.isArray(parsed)) {
      const encrypted = safeStorage.encryptString(JSON.stringify({
        version: 2,
        ownerId,
        messages: cleaned,
      })).toString('base64');
      const temporaryPath = filePath + '.migrating';
      await fs.writeFile(temporaryPath, encrypted, { encoding: 'utf8', mode: 0o600 });
      await fs.rename(temporaryPath, filePath);
    }
    return cleaned;
  } catch {
    return [];
  }
});
handleIpc('chat:save', async (_event, messages: ChatMessage[]) => {
  if (!Array.isArray(messages)) throw new Error('Invalid local chat history.');
  const preferences = await readSettings();
  if (!preferences.saveLocalChatHistory) {
    try { await fs.rm(sessionPath(), { force: true }); } catch { /* cache may not exist */ }
    return { ok: true, saved: false };
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows secure storage is unavailable. Chat history was not written in plaintext.');
  }
  await fs.mkdir(userData(), { recursive: true });
  const cleaned = messages.slice(-100).map(message => ({
    ...message,
    attachments: (message as any).attachments
      ? (message as any).attachments.map(({ id, name, mimeType, kind, size }: any) => ({ id, name, mimeType, kind, size }))
      : undefined,
  }));
  const cloudSession = await readCloudSession();
  const ownerId = cloudSession?.user.id || null;
  const encrypted = safeStorage.encryptString(JSON.stringify({
    version: 2,
    ownerId,
    messages: cleaned,
  })).toString('base64');
  const filePath = sessionPath();
  const temporaryPath = filePath + '.tmp';
  await fs.writeFile(temporaryPath, encrypted, { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temporaryPath, filePath);
  return { ok: true, encrypted: true, accountScoped: true };
});
handleIpc('cloud:cancel', (_event, requestId: string) => {
  if (typeof requestId !== 'string' || requestId.length > 80) return { ok: false };
  const controller = activeChatRequests.get(requestId);
  if (!controller) return { ok: false };
  controller.abort(new Error('Generation cancelled by the user.'));
  return { ok: true };
});

handleIpc('cloud:send', async (_event, payload: {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  attachments?: Attachment[];
  profile: CloudProfile;
  projectId?: string;
  conversationId?: string;
  requestId?: string;
}) => {
  const allowedProfiles: CloudProfile[] = ['fast', 'developer', 'think', 'vision', 'agent'];
  if (!payload || !Array.isArray(payload.messages) || !allowedProfiles.includes(payload.profile)) {
    throw new Error('The cloud request is invalid.');
  }
  if (payload.messages.length < 1 || payload.messages.length > 30) {
    throw new Error('A conversation request must contain 1–30 messages.');
  }
  const messages = payload.messages.slice(-30).map(message => ({
    role: message.role,
    content: String(message.content || '').slice(0, 100_000),
  }));
  const attachments = (payload.attachments || []).slice(0, 8);
  return sendCloudMessage({
    messages,
    attachments,
    profile: payload.profile,
    projectId: payload.projectId,
    conversationId: payload.conversationId,
    requestId: payload.requestId,
  });
});

handleIpc('updates:get-state', () => appUpdateState);
handleIpc('updates:check', () => checkForAppUpdates(true));
handleIpc('updates:install', async () => {
  if (!app.isPackaged || process.platform !== 'win32') {
    return { ok: false, message: 'Install updates from a packaged Windows build.' };
  }
  if (appUpdateState.status !== 'downloaded') {
    return { ok: false, message: 'There is no downloaded update ready to install.' };
  }
  autoUpdater.quitAndInstall(false, true);
  return { ok: true, message: 'Restarting Rmango to install the update.' };
});

handleIpc('app:open-external', async (_event, url: string) => {
  if (typeof url !== 'string') return { ok: false };
  let parsed: URL;
  try { parsed = new URL(url); } catch { return { ok: false }; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return { ok: false };
  await shell.openExternal(parsed.toString());
  return { ok: true };
});
