import { app, BrowserWindow, dialog, ipcMain, powerMonitor, safeStorage, session, shell, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import electronUpdater from 'electron-updater';
import { describeGuestAuthFailure, isInvalidGuestRefreshError, parseAnonymousGuestSession, publicSupabaseOrigin } from './guest-auth.js';

const { autoUpdater } = electronUpdater;

type CloudProfile = 'fast' | 'developer' | 'think' | 'vision' | 'agent';
type ChatMessage = { id?: string; role: 'user' | 'assistant'; content: string; createdAt?: string; modelProfile?: CloudProfile; attachments?: Array<{ id: string; name: string; mimeType: string; kind: 'image' | 'file'; size: number }> };
type Attachment = { name: string; mimeType: string; kind: 'image' | 'file'; size: number; data: string };
type SettingsFile = { projectPath?: string };
type CloudSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
  user: { id: string; email?: string; isAnonymous?: boolean };
  studioConnectorId?: string;
  studioConnectorSecret?: string;
  currentProjectId?: string;
};
type McpTool = { name: string; description?: string; inputSchema: Record<string, any> };
type ApprovalRequest = { requestId: string; taskId?: string; name: string; description: string; arguments: Record<string, unknown> };
type ActivityItem = { name: string; detail: string; ok: boolean };
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
let studioPollTimer: NodeJS.Timeout | null = null;
let studioPollInFlight = false;
const approvalResolvers = new Map<string, (approved: boolean) => void>();
let guestSessionPromise: Promise<CloudSession> | null = null;
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
let updateCheckInFlight = false;
let appUpdateState: AppUpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  message: 'Updates are checked automatically.',
};

const userData = () => app.getPath('userData');
const settingsPath = () => path.join(userData(), 'settings.json');
const legacySessionPath = () => path.join(userData(), 'session.json');
const chatHistoryPath = () => path.join(userData(), 'chat-history.enc');
const cloudSessionPath = () => path.join(userData(), 'cloud-session.enc');

async function readSettings(): Promise<SettingsFile> {
  try {
    const parsed = JSON.parse(await fs.readFile(settingsPath(), 'utf8')) as Partial<SettingsFile>;
    return { projectPath: typeof parsed.projectPath === 'string' ? parsed.projectPath : undefined };
  } catch {
    return {};
  }
}

async function writeSettings(settings: SettingsFile) {
  await fs.mkdir(userData(), { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf8');
}

async function getCloudApiBaseUrl(): Promise<string> {
  let candidate = process.env.RMANGO_CLOUD_API_URL?.trim() || '';
  if (!candidate) {
    try {
      const configPath = path.join(app.getAppPath(), 'cloud-config.json');
      const config = JSON.parse(await fs.readFile(configPath, 'utf8')) as { apiBaseUrl?: string };
      candidate = typeof config.apiBaseUrl === 'string' ? config.apiBaseUrl.trim() : '';
    } catch {
      return '';
    }
  }
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate);
    if (
      parsed.protocol !== 'https:' ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname.toLowerCase())
    ) {
      throw new Error('Rmango Cloud must use a public HTTPS origin without credentials or query parameters.');
    }
    return parsed.origin + parsed.pathname.replace(/\/+$/, '');
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'The configured Rmango Cloud URL is invalid.');
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
  const baseUrl = await getCloudApiBaseUrl();
  if (!baseUrl) throw new Error('The Rmango cloud backend is not configured in this build.');
  const response = await fetch(baseUrl + '/api/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json() as any;
  if (!response.ok || !payload.session || !payload.user) {
    throw new Error(payload.error || 'Your Rmango cloud session expired. Please sign in again.');
  }
  const next: CloudSession = {
    ...session,
    accessToken: payload.session.accessToken,
    refreshToken: payload.session.refreshToken,
    expiresAt: payload.session.expiresAt,
    user: {
      id: payload.user.id,
      email: payload.user.email || session.user.email,
      isAnonymous: typeof payload.user.isAnonymous === 'boolean'
        ? payload.user.isAnonymous
        : session.user.isAnonymous,
    },
  };
  await writeCloudSession(next);
  return next;
}

async function getValidCloudSession(): Promise<CloudSession> {
  let session = await readCloudSession();
  if (!session) throw new Error('RMango could not start your guest workspace. Check the service connection and retry.');
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
  const payload = await cloudApiRequest<any>('/api/auth/sign-in', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }, false);
  const session: CloudSession = {
    accessToken: payload.session.accessToken,
    refreshToken: payload.session.refreshToken,
    expiresAt: payload.session.expiresAt,
    user: payload.user,
  };
  await writeCloudSession(session);
  if (mcpClient) await registerCloudStudioConnector();
  return { ok: true, user: session.user };
}

async function cloudSignUp(email: string, password: string, displayName?: string) {
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
  if (mcpClient) await registerCloudStudioConnector();
  return { ok: true, requiresEmailConfirmation: false, user: session.user };
}

async function cloudSignOut() {
  const session = await readCloudSession();
  if (session?.studioConnectorId) await disconnectCloudStudioConnector().catch(() => undefined);
  if (session) {
    try { await cloudApiRequest('/api/auth/sign-out', { method: 'POST', body: '{}' }); } catch { /* Always clear local session. */ }
  }
  await clearCloudSession();
  return { ok: true };
}

async function createGuestSession(): Promise<CloudSession> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows secure storage is unavailable. RMango cannot safely save your guest session on this device.');
  }

  const config = await cloudApiRequest<{ supabaseUrl?: string; publishableKey?: string }>(
    '/api/public/config',
    {},
    false,
  );
  if (
    typeof config.supabaseUrl !== 'string' ||
    typeof config.publishableKey !== 'string' ||
    !config.publishableKey ||
    config.publishableKey.length > 8_192
  ) {
    throw new Error('The RMango service did not return valid public guest-auth settings.');
  }

  const supabaseOrigin = publicSupabaseOrigin(config.supabaseUrl);

  // Create the anonymous identity from this desktop. Supabase therefore sees
  // each user's IP for its normal anonymous-sign-in rate limits. The only key
  // sent here is the public publishable key; service-role, OIDC and model
  // provider secrets remain on the server.
  const response = await fetch(supabaseOrigin + '/auth/v1/signup', {
    method: 'POST',
    headers: {
      apikey: config.publishableKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ data: { name: 'RMango Guest', app: 'rmango-desktop' } }),
    signal: AbortSignal.timeout(25_000),
  });

  const raw = await response.text();
  let payload: unknown = {};
  try { payload = raw ? JSON.parse(raw) : {}; }
  catch { payload = { message: raw.slice(0, 400) }; }

  if (!response.ok) {
    throw new Error(describeGuestAuthFailure(response.status, payload));
  }

  const guest = parseAnonymousGuestSession(payload);
  const session: CloudSession = {
    ...guest,
    user: { ...guest.user },
  };
  await writeCloudSession(session);

  if (mcpClient) {
    await registerCloudStudioConnector().catch(() => undefined);
  }
  return session;
}

function getOrCreateGuestSession(): Promise<CloudSession> {
  if (!guestSessionPromise) {
    guestSessionPromise = createGuestSession().finally(() => {
      guestSessionPromise = null;
    });
  }
  return guestSessionPromise;
}

async function getCloudState() {
  const apiBaseUrl = await getCloudApiBaseUrl();
  let currentSession = await readCloudSession();
  if (!apiBaseUrl) {
    return {
      configured: false,
      signedIn: Boolean(currentSession),
      isGuest: currentSession?.user.isAnonymous === true,
      email: currentSession?.user.email,
      message: 'The managed RMango AI service is not connected to this build yet.',
    };
  }

  let serviceReady = false;
  let healthError: string | undefined;
  let sessionError: string | undefined;
  try {
    const health = await cloudApiRequest<any>('/api/health', {}, false);
    serviceReady = health.status === 'ready';
    if (!serviceReady) {
      healthError = 'The RMango AI service is not ready. Its operator must finish the one-time deployment and usage setup.';
    }
  } catch (error) {
    healthError = error instanceof Error ? error.message : 'The RMango AI service is temporarily unavailable.';
  }

  if (serviceReady) {
    if (!currentSession) {
      try {
        currentSession = await getOrCreateGuestSession();
      } catch (error) {
        sessionError = error instanceof Error ? error.message : 'RMango could not start a guest workspace.';
      }
    } else {
      try {
        currentSession = await getValidCloudSession();
        if (mcpClient && !currentSession.studioConnectorId) {
          await registerCloudStudioConnector().catch(() => undefined);
          currentSession = await readCloudSession() || currentSession;
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'The saved RMango session is unavailable.';
        if (currentSession.user.isAnonymous && isInvalidGuestRefreshError(detail)) {
          await clearCloudSession();
          currentSession = null;
          try {
            currentSession = await getOrCreateGuestSession();
          } catch (guestError) {
            sessionError = guestError instanceof Error ? guestError.message : detail;
          }
        } else {
          // Preserve the encrypted session during transient network/provider
          // errors. A later retry can refresh it without losing guest data.
          sessionError = detail;
          currentSession = null;
        }
      }
    }
  }

  return {
    configured: true,
    serviceReady,
    signedIn: Boolean(currentSession),
    isGuest: currentSession?.user.isAnonymous === true,
    email: currentSession?.user.email,
    apiHost: new URL(apiBaseUrl).host,
    message: sessionError || healthError,
    currentProjectId: currentSession?.currentProjectId,
  };
}

async function getCloudModels() {
  return cloudApiRequest<any>('/api/models', {}, true);
}

async function sendCloudMessage(payload: {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  attachments?: Attachment[];
  profile: CloudProfile;
  projectId?: string;
  conversationId?: string;
  requestId?: string;
}) {
  const session = await getValidCloudSession();
  const baseUrl = await getCloudApiBaseUrl();
  if (!baseUrl) throw new Error('The Rmango cloud backend is not configured.');
  const requestId = payload.requestId || randomUUID();
  const response = await fetch(baseUrl + '/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + session.accessToken },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(125_000),
  });
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
  let content = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const delta = decoder.decode(value, { stream: true });
    if (delta) {
      content += delta;
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send('cloud:chat-delta', { requestId, delta });
      }
    }
  }
  content += decoder.decode();
  return {
    requestId,
    content,
    conversationId: response.headers.get('X-Rmango-Conversation-Id') || payload.conversationId || undefined,
    modelId: response.headers.get('X-Rmango-Model') || undefined,
    profile: payload.profile,
    activity: [] as ActivityItem[],
  };
}

function isTrustedRendererUrl(rawUrl: string): boolean {
  if (!rawUrl) return false;
  try {
    const parsed = new URL(rawUrl);
    if (!app.isPackaged) {
      const devUrl = new URL(process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173');
      const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(devUrl.hostname);
      return loopback && parsed.origin === devUrl.origin && parsed.protocol === 'http:';
    }
    if (parsed.protocol !== 'file:') return false;
    return path.resolve(fileURLToPath(parsed)) === path.resolve(path.join(__dirname, '../dist/index.html'));
  } catch {
    return false;
  }
}

function registerTrustedIpcHandler(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => unknown,
) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (event.senderFrame !== event.sender.mainFrame || !isTrustedRendererUrl(event.senderFrame?.url || '')) {
      throw new Error('Blocked an IPC request from an untrusted renderer.');
    }
    return handler(event, ...args);
  });
}

function installRendererSecurityPolicies() {
  const csp = [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss: ws://127.0.0.1:5173",
  ].join('; ');
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!isTrustedRendererUrl(details.url)) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
        'X-Content-Type-Options': ['nosniff'],
        'Referrer-Policy': ['no-referrer'],
        'X-Frame-Options': ['DENY'],
      },
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1060,
    minHeight: 700,
    backgroundColor: '#0c1711',
    title: 'Rmango',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault();
  });
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  if (!app.isPackaged) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
  mainWindow.on('closed', () => { mainWindow = null; });
}

async function connectRoblox() {
  if (mcpClient) {
    const cloudLink = await registerCloudStudioConnector().catch(error => ({
      linked: false,
      message: error instanceof Error ? error.message : "Could not link the Studio connector to cloud.",
    }));
    return { ok: true, connected: true, toolCount: connectedTools.length, cloudLinked: cloudLink.linked, cloudMessage: cloudLink.message };
  }
  if (process.platform !== 'win32') {
    return { ok: false, connected: false, error: 'The bundled Roblox Studio MCP connection is configured for Windows.' };
  }
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return { ok: false, connected: false, error: 'Windows LOCALAPPDATA was not found.' };
  const mcpBat = path.join(localAppData, 'Roblox', 'mcp.bat');
  if (!existsSync(mcpBat)) {
    return {
      ok: false,
      connected: false,
      error: 'Roblox MCP launcher was not found at ' + mcpBat + '. Update Roblox Studio, then enable Assistant → Manage MCP Servers → Enable Studio as MCP server.',
    };
  }
  try {
    const transport = new StdioClientTransport({
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', '\"' + mcpBat + '\"'],
      env: process.env as Record<string, string>,
    });
    const client = new Client({ name: 'rmango-desktop', version: app.getVersion() }, { capabilities: {} });
    await client.connect(transport);
    const result = await client.listTools();
    mcpClient = client;
    mcpTransport = transport;
    connectedTools = result.tools as McpTool[];
    selectedStudioId = await discoverStudioId().catch(() => undefined);
    const cloudLink = await registerCloudStudioConnector().catch(error => ({
      linked: false,
      message: error instanceof Error ? error.message : "Could not link the Studio connector to cloud.",
    }));
    return {
      ok: true,
      connected: true,
      toolCount: connectedTools.length,
      tools: connectedTools.map(tool => tool.name),
      studioId: selectedStudioId,
      cloudLinked: cloudLink.linked,
      cloudMessage: cloudLink.message,
    };
  } catch (error) {
    mcpClient = null;
    mcpTransport = null;
    connectedTools = [];
    selectedStudioId = undefined;
    return { ok: false, connected: false, error: error instanceof Error ? error.message : String(error) };
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
  return { ok: true, connected: false };
}

const READ_ONLY_STUDIO_TOOLS = new Set([
  'list_roblox_studios', 'get_studio_state', 'script_read', 'script_search',
  'script_grep', 'search_game_tree', 'inspect_instance', 'get_console_output',
  'screen_capture', 'http_get', 'skill', 'list_skills', 'search_asset',
  'wait_job_finished',
]);

const APPROVAL_REQUIRED_STUDIO_TOOLS = new Set([
  'multi_edit', 'execute_luau', 'generate_mesh', 'generate_material', 'generate_texture',
  'generate_procedural_model', 'generate_scene', 'generate_animation', 'generate_avatar',
  'auto_setup_avatar', 'segment_mesh', 'store_image', 'insert_asset', 'upload_image', 'subagent', 'start_stop_play',
  'character_navigation', 'user_keyboard_input', 'user_mouse_input', 'save_place',
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

function findStudioId(value: any): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStudioId(item);
      if (found) return found;
    }
    return undefined;
  }
  for (const key of ['studio_id', 'studioId']) {
    if (typeof value[key] === 'string' && value[key]) return value[key];
  }
  for (const child of Object.values(value)) {
    const found = findStudioId(child);
    if (found) return found;
  }
  return undefined;
}

async function discoverStudioId(): Promise<string | undefined> {
  if (!mcpClient || !connectedTools.some(tool => tool.name === 'list_roblox_studios')) return undefined;
  try {
    const result = await mcpClient.callTool({ name: 'list_roblox_studios', arguments: {} });
    const structuredId = findStudioId((result as any).structuredContent);
    if (structuredId) return structuredId;
    for (const item of (result as any).content || []) {
      if (item.type === 'text') {
        const parsedId = findStudioId(tryParseJson(item.text));
        if (parsedId) return parsedId;
      }
    }
  } catch { /* Studio may not have announced a session yet. */ }
  return undefined;
}

function withStudioId(tool: McpTool, input: Record<string, unknown>) {
  if (tool.name === 'list_roblox_studios' || !selectedStudioId) return input;
  // Roblox Studio MCP scopes calls to one open Studio instance via studio_id.
  // Keep the selected ID authoritative rather than allowing a model-supplied ID.
  return { ...input, studio_id: selectedStudioId };
}

async function requestStudioApproval(name: string, description: string, args: Record<string, unknown>, taskId?: string): Promise<boolean> {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('Rmango window is not available for the approval prompt.');
  const requestId = randomUUID();
  const safeArgs = JSON.parse(JSON.stringify(args, (_key, value) => {
    if (typeof value === 'string' && value.length > 5_000) return value.slice(0, 5_000) + '… [truncated]';
    return value;
  }));
  const request: ApprovalRequest = { requestId, taskId, name, description, arguments: safeArgs };
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
  return approved;
}

async function callStudioTool(
  name: string,
  args: Record<string, unknown>,
  context?: { taskId?: string; onApproval?: (approved: boolean) => Promise<void> },
) {
  if (!mcpClient) throw new Error('Roblox Studio is not connected.');
  const tool = connectedTools.find(item => item.name === name);
  if (!tool || (!READ_ONLY_STUDIO_TOOLS.has(name) && !APPROVAL_REQUIRED_STUDIO_TOOLS.has(name))) {
    throw new Error('Tool ' + name + ' is not enabled in Rmango.');
  }
  if (APPROVAL_REQUIRED_STUDIO_TOOLS.has(name)) {
    const approved = await requestStudioApproval(
      name,
      tool.description || ('This action will run ' + name + ' in the connected Roblox Studio session.'),
      args,
      context?.taskId,
    );
    // Persist the decision before running any mutating tool. A cancelled/stale cloud command
    // is rejected here, so an old approval dialog cannot mutate a later task.
    if (context?.onApproval) await context.onApproval(approved);
    if (!approved) throw new Error('The request for ' + name + ' was not approved. No Studio changes were made.');
  }
  const result = await mcpClient.callTool({ name, arguments: withStudioId(tool, args) });
  if ((result as any).isError) throw new Error(JSON.stringify((result as any).content || result).slice(0, 2_000));
  return result;
}

async function registerCloudStudioConnector() {
  if (!mcpClient) return { linked: false, message: "Roblox Studio is not connected." };
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
  if (studioPollInFlight || !mcpClient) return;
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
        const taskId = typeof command.task_id === "string" ? command.task_id : undefined;
        const result = await callStudioTool(toolName, args, {
          taskId,
          onApproval: taskId ? async approved => {
            await cloudApiRequest("/api/studio/approval", {
              method: "POST",
              body: JSON.stringify({
                connectorId: session.studioConnectorId,
                connectorSecret: session.studioConnectorSecret,
                commandId: command.id,
                approved,
              }),
            });
          } : undefined,
        });
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
  if (depth > 8) return [];
  const ignored = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.next', 'coverage']);
  let entries;
  try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { return []; }
  const result: Array<{ name: string; path: string; kind: 'file' | 'folder' }> = [];
  for (const entry of entries.slice(0, 500)) {
    if (ignored.has(entry.name) || entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push({ name: entry.name, path: fullPath, kind: 'folder' });
      if (depth < 8) {
        const nested = await projectFiles(fullPath, depth + 1);
        result.push(...nested.slice(0, Math.max(0, 2_000 - result.length)));
      }
    } else {
      result.push({ name: entry.name, path: fullPath, kind: 'file' });
    }
    if (result.length >= 2_000) break;
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

function validateCloudUuid(value: string, label: string) {
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new Error("Invalid " + label + ".");
  }
}

async function listAgentTasks(projectId?: string) {
  if (projectId) validateCloudUuid(projectId, "cloud project ID");
  const query = projectId ? "?projectId=" + encodeURIComponent(projectId) : "";
  return cloudApiRequest<any>("/api/agent/tasks" + query);
}

async function getAgentTask(taskId: string) {
  validateCloudUuid(taskId, "agent task ID");
  return cloudApiRequest<any>("/api/agent/tasks/" + taskId);
}

async function createAgentTask(payload: {
  projectId: string;
  conversationId?: string;
  taskText: string;
  profile: CloudProfile;
}) {
  if (!payload) throw new Error("Invalid agent task request.");
  validateCloudUuid(payload.projectId, "cloud project ID");
  if (payload.conversationId) validateCloudUuid(payload.conversationId, "conversation ID");
  if (typeof payload.taskText !== "string" || payload.taskText.trim().length < 8 || payload.taskText.length > 12_000) {
    throw new Error("Describe the Roblox task using between 8 and 12,000 characters.");
  }
  const profiles: CloudProfile[] = ["fast", "developer", "think", "vision", "agent"];
  if (!profiles.includes(payload.profile)) throw new Error("Invalid Rmango model profile.");
  return cloudApiRequest<any>("/api/agent/tasks", {
    method: "POST",
    body: JSON.stringify({ ...payload, taskText: payload.taskText.trim() }),
    signal: AbortSignal.timeout(30_000),
  });
}

async function controlAgentTask(payload: { taskId: string; action: "pause" | "resume" | "cancel" | "retry" }) {
  if (!payload) throw new Error("Invalid agent task control request.");
  validateCloudUuid(payload.taskId, "agent task ID");
  const actions = ["pause", "resume", "cancel", "retry"] as const;
  if (!actions.includes(payload.action)) throw new Error("Invalid agent task action.");
  return cloudApiRequest<any>("/api/agent/tasks/" + payload.taskId, {
    method: "PATCH",
    body: JSON.stringify({ action: payload.action }),
  });
}

async function submitAgentFeedback(payload: { taskId: string; helpful: boolean }) {
  if (!payload || typeof payload.helpful !== "boolean") throw new Error("Feedback must be helpful or not helpful.");
  validateCloudUuid(payload.taskId, "agent task ID");
  return cloudApiRequest<any>("/api/agent/tasks/" + payload.taskId + "/feedback", {
    method: "POST",
    body: JSON.stringify({ helpful: payload.helpful }),
    signal: AbortSignal.timeout(20_000),
  });
}

async function getCloudProjectIndex(projectId: string) {
  validateCloudUuid(projectId, "cloud project ID");
  return cloudApiRequest<any>("/api/projects/" + projectId + "/index");
}

async function startCloudProjectIndex(projectId: string) {
  validateCloudUuid(projectId, "cloud project ID");
  return cloudApiRequest<any>("/api/projects/" + projectId + "/index", {
    method: "POST",
    body: JSON.stringify({}),
  });
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
  if (!settings.projectPath) throw new Error("Open a local project folder before uploading it to Rmango Cloud.");
  const session = await getValidCloudSession();
  const root = await fs.realpath(settings.projectPath);
  const projectName = path.basename(root) || "Roblox Project";
  const created = await cloudApiRequest<any>("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      name: projectName,
      description: "Source files imported from " + projectName + " using Rmango Desktop.",
    }),
  });

  const projectId = created.project?.id;
  if (typeof projectId !== "string") throw new Error("The cloud service did not return a project ID.");
  await writeCloudSession({ ...session, currentProjectId: projectId });

  const entries = (await projectFiles(root)).filter(item => item.kind === "file").slice(0, 2_000);
  const uploaded: string[] = [];
  const skipped: Array<{ name: string; reason: string }> = [];

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const relativePath = path.relative(root, entry.path);
    try {
      const content = await readProjectFile(root, relativePath);
      const extension = path.extname(entry.name).toLowerCase();
      const mimeType = extension === ".json" ? "application/json" : extension === ".csv" ? "text/csv" : "text/plain";
      const bytes = Buffer.from(content, "utf8");
      await cloudApiRequest("/api/projects/" + projectId + "/files", {
        method: "POST",
        body: JSON.stringify({
          relativePath: relativePath.split(path.sep).join("/"),
          fileName: entry.name,
          mimeType,
          sizeBytes: bytes.length,
          dataBase64: bytes.toString("base64"),
        }),
      });
      uploaded.push(relativePath);
    } catch (error) {
      skipped.push({
        name: relativePath,
        reason: error instanceof Error ? error.message : "File could not be uploaded.",
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

  return {
    ok: true,
    projectId,
    projectName,
    totalFiles: entries.length,
    uploaded: uploaded.length,
    skipped,
  };
}

async function runDiagnostics() {
  if (!mcpClient) return { ok: false, error: 'Connect Roblox Studio first.' };
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

async function checkForAppUpdates(): Promise<AppUpdateState> {
  if (!app.isPackaged || process.platform !== 'win32') {
    broadcastUpdateState({
      status: 'unsupported',
      message: 'GitHub updates are available in the installed Windows app.',
    });
    return appUpdateState;
  }

  if (updateCheckInFlight || ['downloading', 'downloaded'].includes(appUpdateState.status)) return appUpdateState;
  updateCheckInFlight = true;
  broadcastUpdateState({ status: 'checking', error: undefined, message: 'Checking GitHub Releases…' });

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    broadcastUpdateState({
      status: 'error',
      error: message,
      message: 'Could not check GitHub Releases.',
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
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
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

  // Check shortly after launch, then every five minutes. Installation still requires the user's click.
  const startupTimer = setTimeout(() => { void checkForAppUpdates(); }, 8_000);
  startupTimer.unref();
  const updateTimer = setInterval(() => { void checkForAppUpdates(); }, UPDATE_CHECK_INTERVAL_MS);
  updateTimer.unref();
  powerMonitor.on('resume', () => { void checkForAppUpdates(); });
}

app.whenReady().then(() => {
  installRendererSecurityPolicies();
  createWindow();
  initializeAutoUpdates();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { void disconnectRoblox(); });

registerTrustedIpcHandler('app:get-state', async () => {
  const settings = await readSettings();
  const files = settings.projectPath ? await projectFiles(settings.projectPath) : [];
  return {
    appVersion: app.getVersion(),
    platform: process.platform,
    projectPath: settings.projectPath || '',
    projectFiles: files,
    studioConnected: mcpAvailable(),
    studioToolCount: safeToolList().length,
  };
});

registerTrustedIpcHandler('cloud:state', () => getCloudState());
registerTrustedIpcHandler('cloud:sign-in', async (_event, payload: { email: string; password: string }) => {
  if (!payload || typeof payload.email !== 'string' || typeof payload.password !== 'string') {
    throw new Error('Enter your Rmango account email and password.');
  }
  return cloudSignIn(payload.email, payload.password);
});
registerTrustedIpcHandler('cloud:sign-up', async (_event, payload: { email: string; password: string; displayName?: string }) => {
  if (!payload || typeof payload.email !== 'string' || typeof payload.password !== 'string') {
    throw new Error('Enter an email and password to create a Rmango account.');
  }
  return cloudSignUp(payload.email, payload.password, payload.displayName);
});
registerTrustedIpcHandler('cloud:sign-out', () => cloudSignOut());
registerTrustedIpcHandler('cloud:models', () => getCloudModels());

registerTrustedIpcHandler('project:open', async () => {
  const picked = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  if (picked.canceled || !picked.filePaths[0]) return { canceled: true };
  const root = picked.filePaths[0];
  const settings = await readSettings();
  await writeSettings({ ...settings, projectPath: root });
  return { canceled: false, path: root, files: await projectFiles(root) };
});
registerTrustedIpcHandler('project:upload-cloud', () => uploadCloudProject());
registerTrustedIpcHandler('project:changes', (_event, projectId: string) => getCloudProjectChanges(projectId));
registerTrustedIpcHandler('agent:tasks:list', (_event, projectId?: string) => listAgentTasks(projectId));
registerTrustedIpcHandler('agent:tasks:get', (_event, taskId: string) => getAgentTask(taskId));
registerTrustedIpcHandler('agent:tasks:create', (_event, payload: { projectId: string; conversationId?: string; taskText: string; profile: CloudProfile }) => createAgentTask(payload));
registerTrustedIpcHandler('agent:tasks:control', (_event, payload: { taskId: string; action: "pause" | "resume" | "cancel" | "retry" }) => controlAgentTask(payload));
registerTrustedIpcHandler('agent:tasks:feedback', (_event, payload: { taskId: string; helpful: boolean }) => submitAgentFeedback(payload));
registerTrustedIpcHandler('project:index:get', (_event, projectId: string) => getCloudProjectIndex(projectId));
registerTrustedIpcHandler('project:index:start', (_event, projectId: string) => startCloudProjectIndex(projectId));
registerTrustedIpcHandler('project:review-change', (_event, payload: { projectId: string; changeId: string; decision: "approve" | "reject" }) => {
  if (!payload || (payload.decision !== "approve" && payload.decision !== "reject")) {
    throw new Error("A valid approve/reject decision is required.");
  }
  return reviewCloudProjectChange(payload.projectId, payload.changeId, payload.decision);
});
registerTrustedIpcHandler('project:download-cloud', (_event, projectId: string) => downloadCloudProjectZip(projectId));
registerTrustedIpcHandler('project:clear', async () => {
  const settings = await readSettings();
  delete settings.projectPath;
  await writeSettings(settings);
  return { ok: true };
});

registerTrustedIpcHandler('mcp:connect', () => connectRoblox());
registerTrustedIpcHandler('mcp:disconnect', () => disconnectRoblox());
registerTrustedIpcHandler('mcp:state', async () => {
  const session = await readCloudSession();
  return {
    connected: mcpAvailable(),
    cloudLinked: Boolean(session?.studioConnectorId && session.studioConnectorSecret),
    toolCount: safeToolList().length,
    tools: safeToolList().map(tool => tool.name),
    studioId: selectedStudioId || null,
  };
});
registerTrustedIpcHandler('mcp:list-tools', () => ({
  all: connectedTools.map(tool => ({ name: tool.name, description: tool.description || '' })),
  readOnly: safeToolList().filter(tool => READ_ONLY_STUDIO_TOOLS.has(tool.name)).map(tool => tool.name),
  approvalRequired: safeToolList().filter(tool => APPROVAL_REQUIRED_STUDIO_TOOLS.has(tool.name)).map(tool => tool.name),
}));
registerTrustedIpcHandler('mcp:diagnostics', () => runDiagnostics());
registerTrustedIpcHandler('studio:approval-result', (_event, response: { requestId: string; approved: boolean }) => {
  const resolve = approvalResolvers.get(response.requestId);
  if (resolve) {
    approvalResolvers.delete(response.requestId);
    resolve(Boolean(response.approved));
    return { ok: true };
  }
  return { ok: false };
});

async function readEncryptedChatHistory(): Promise<ChatMessage[]> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows secure storage is unavailable. Rmango will not save chat history in plain text.');
  }
  try {
    const encrypted = await fs.readFile(chatHistoryPath(), 'utf8');
    const parsed = JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, 'base64')));
    if (!Array.isArray(parsed)) throw new Error('Saved chat history has an invalid format.');
    return parsed as ChatMessage[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  // One-time migration of legacy plaintext history into Windows-protected storage.
  try {
    const legacy = JSON.parse(await fs.readFile(legacySessionPath(), 'utf8'));
    if (Array.isArray(legacy)) {
      await writeEncryptedChatHistory(legacy as ChatMessage[]);
      await fs.rm(legacySessionPath(), { force: true });
      return legacy as ChatMessage[];
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error('Could not safely migrate your old local chat history. The original file was left untouched.');
    }
  }
  return [];
}

async function writeEncryptedChatHistory(messages: ChatMessage[]) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows secure storage is unavailable. Rmango will not save chat history in plain text.');
  }
  await fs.mkdir(userData(), { recursive: true });
  const encrypted = safeStorage.encryptString(JSON.stringify(messages)).toString('base64');
  await fs.writeFile(chatHistoryPath(), encrypted, { encoding: 'utf8', mode: 0o600 });
}

registerTrustedIpcHandler('chat:load', async () => readEncryptedChatHistory());
registerTrustedIpcHandler('chat:save', async (_event, messages: ChatMessage[]) => {
  if (!Array.isArray(messages) || messages.length > 100) {
    throw new Error('Chat history must contain no more than 100 messages.');
  }
  const cleaned = messages.map(message => {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') {
      throw new Error('Chat history contains an invalid message.');
    }
    if (message.content.length > 100_000) throw new Error('A chat message exceeds the local storage limit.');
    const attachments = Array.isArray(message.attachments) ? message.attachments.slice(0, 8).map(item => ({
      id: String(item.id || '').slice(0, 100),
      name: String(item.name || '').slice(0, 200),
      mimeType: String(item.mimeType || '').slice(0, 100),
      kind: item.kind === 'image' ? 'image' as const : 'file' as const,
      size: Math.max(0, Math.min(Number(item.size) || 0, 15 * 1024 * 1024)),
    })) : undefined;
    return {
      id: typeof message.id === 'string' ? message.id.slice(0, 100) : undefined,
      role: message.role,
      content: message.content,
      createdAt: typeof message.createdAt === 'string' ? message.createdAt.slice(0, 40) : new Date().toISOString(),
      modelProfile: message.modelProfile,
      attachments,
    };
  });
  await writeEncryptedChatHistory(cleaned);
  return { ok: true, encrypted: true };
});

registerTrustedIpcHandler('cloud:send', async (_event, payload: {
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

registerTrustedIpcHandler('updates:get-state', () => appUpdateState);
registerTrustedIpcHandler('updates:check', () => checkForAppUpdates());
registerTrustedIpcHandler('updates:install', async () => {
  if (!app.isPackaged || process.platform !== 'win32') {
    return { ok: false, message: 'Install updates from a packaged Windows build.' };
  }
  if (appUpdateState.status !== 'downloaded') {
    return { ok: false, message: 'There is no downloaded update ready to install.' };
  }
  autoUpdater.quitAndInstall(false, true);
  return { ok: true, message: 'Restarting Rmango to install the update.' };
});

registerTrustedIpcHandler('app:open-external', async (_event, rawUrl: string) => {
  if (typeof rawUrl !== 'string' || rawUrl.length > 2_048) return { ok: false };
  let url: URL;
  try { url = new URL(rawUrl); } catch { return { ok: false }; }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) return { ok: false };
  await shell.openExternal(url.toString());
  return { ok: true };
});
