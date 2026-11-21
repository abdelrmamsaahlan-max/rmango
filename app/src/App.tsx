import { ChangeEvent, DragEvent, FormEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertCircle, ArrowRight, Bot, Check, CheckCircle2, ChevronDown, CircleHelp,
  Code2, Cpu, Download, ExternalLink, FileCode2, FileJson, FileText, Folder,
  FolderOpen, Gamepad2, Image as ImageIcon, Link2, LoaderCircle, Menu,
  LockKeyhole, MailCheck, Eye, EyeOff, MessageSquare, MoreHorizontal, Paperclip, Pencil, Plus, RefreshCw, Search, Send, Trash2,
  Settings2, ShieldCheck, Sparkles, Upload, Wrench, X, Layers3, Square,
  Palette, Gauge, UserRound, Bell, Keyboard, HardDrive, PanelRight, SlidersHorizontal, Info, Copy
} from 'lucide-react';
import type {
  AppPreferences, AppState, AttachmentPayload, ChatAttachment, ChatMessage, CloudAgentTask, CloudConversation, CloudModelProfile, CloudModels, CloudProject, CloudProjectChange,
  AgentActivity, CloudProfile, CloudState, CloudUsage, ProjectFile, StudioApprovalRequest, StudioInstance, UpdateState
} from './types';

type ActivityItem = AgentActivity;
type PendingAttachment = AttachmentPayload & { id: string; previewUrl?: string };
type PendingFollowup = { id: string; content: string; profile: CloudProfile; attachments: PendingAttachment[]; queuedAt: string };
type ProjectDialogState = { mode: 'create' | 'rename'; projectId?: string; name: string; description: string } | null;
type SettingsSection = 'general' | 'appearance' | 'ai' | 'usage' | 'account' | 'privacy' | 'notifications' | 'updates' | 'advanced';

const SETTINGS_NAVIGATION: Array<{
  id: SettingsSection;
  label: string;
  description: string;
  group: string;
  icon: typeof Settings2;
}> = [
  { id: 'general', label: 'General', description: 'Workspace and keyboard', group: 'WORKSPACE', icon: Settings2 },
  { id: 'appearance', label: 'Appearance', description: 'Theme, layout and motion', group: 'WORKSPACE', icon: Palette },
  { id: 'ai', label: 'AI & Models', description: 'Default profile and models', group: 'AI', icon: Cpu },
  { id: 'usage', label: 'Usage & Plan', description: 'Requests and token usage', group: 'AI', icon: Gauge },
  { id: 'account', label: 'Account', description: 'Sign-in and cloud status', group: 'ACCOUNT', icon: UserRound },
  { id: 'privacy', label: 'Privacy & Security', description: 'Local data and protections', group: 'ACCOUNT', icon: ShieldCheck },
  { id: 'notifications', label: 'Notifications', description: 'Desktop alerts', group: 'APP', icon: Bell },
  { id: 'updates', label: 'Updates', description: 'Stable releases', group: 'APP', icon: Download },
  { id: 'advanced', label: 'Advanced', description: 'Diagnostics and reset', group: 'APP', icon: Wrench },
];

const timeNow = () => new Date().toISOString();
const displayTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function MangoMark({ size = 34, className = '' }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" fill="none" role="img" aria-label="Rmango mango mark">
      <defs>
        <linearGradient id="mango-body" x1="12" y1="8" x2="53" y2="57" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFE36C"/><stop offset=".52" stopColor="#FFC43F"/><stop offset="1" stopColor="#EE941E"/>
        </linearGradient>
        <linearGradient id="mango-leaf" x1="36" y1="4" x2="58" y2="23" gradientUnits="userSpaceOnUse">
          <stop stopColor="#B7E87B"/><stop offset="1" stopColor="#4A9B4B"/>
        </linearGradient>
      </defs>
      <path d="M34.6 13.3C27.8 7.7 17.9 11.1 12.7 18.1 5.4 27.7 9.2 43.7 18.2 52.3c7.3 7 17.9 5.6 25.2-1.9 7.6-7.8 11.2-20.1 6.5-29.1-3-5.7-8.6-7.2-15.3-8Z" fill="url(#mango-body)"/>
      <path d="M34.8 13.6c5.2-6.3 12.7-8.8 20.4-6.1-2.3 8.7-8.6 13.5-17.6 13.2-2.6-.1-4.7-1.8-5.2-4.2-.3-1 .4-2 2.4-2.9Z" fill="url(#mango-leaf)"/>
      <path d="M35.5 16.8c4.4-2.4 8.6-4.4 14-6.2" stroke="#286F3D" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M19 23.4c2.2-4.5 5.5-6.9 9.1-7.8" stroke="#FFF0A9" strokeWidth="3" strokeLinecap="round" opacity=".8"/>
      <path d="M16.7 35c.1 5.3 2.5 10 6.2 13" stroke="#F9A829" strokeWidth="1.4" strokeLinecap="round" opacity=".55"/>
    </svg>
  );
}

function AccountSecurityVisual() {
  return (
    <div className="account-security-art" aria-hidden="true">
      <div className="account-security-orbit orbit-one" />
      <div className="account-security-orbit orbit-two" />
      <span className="account-security-star star-one">✦</span>
      <span className="account-security-star star-two">✧</span>
      <svg viewBox="0 0 220 154" role="presentation">
        <defs>
          <linearGradient id="account-shield-fill" x1="70" y1="18" x2="154" y2="132" gradientUnits="userSpaceOnUse">
            <stop stopColor="#E6F4B7"/><stop offset=".55" stopColor="#B6DA79"/><stop offset="1" stopColor="#5A9A59"/>
          </linearGradient>
          <linearGradient id="account-shield-edge" x1="82" y1="20" x2="154" y2="131" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F4FFD9"/><stop offset="1" stopColor="#86B86D"/>
          </linearGradient>
        </defs>
        <path d="M110 17 163 38v37c0 34-23 54-53 66-30-12-53-32-53-66V38l53-21Z" fill="url(#account-shield-fill)" opacity=".16"/>
        <path d="M110 25 154 42v32c0 27-18 44-44 56-26-12-44-29-44-56V42l44-17Z" fill="url(#account-shield-fill)" stroke="url(#account-shield-edge)" strokeWidth="2.4"/>
        <path d="M110 39 141 51v23c0 19-12 31-31 41-19-10-31-22-31-41V51l31-12Z" fill="#183C27" opacity=".9"/>
        <rect x="96" y="68" width="28" height="25" rx="7" fill="#D8F0A5"/>
        <path d="M101 68v-7a9 9 0 0 1 18 0v7" stroke="#D8F0A5" strokeWidth="5" strokeLinecap="round" fill="none"/>
        <circle cx="110" cy="80" r="3.2" fill="#345C35"/>
        <path d="M110 83v6" stroke="#345C35" strokeWidth="2.8" strokeLinecap="round"/>
        <path d="m49 91 8-8 8 8-8 8-8-8Z" fill="#C8E899" opacity=".85"/>
        <circle cx="170" cy="47" r="5" fill="#E4F4B5"/><circle cx="167" cy="111" r="3.5" fill="#A8D576"/><circle cx="53" cy="48" r="3" fill="#F3D785"/>
      </svg>
      <div className="account-security-glow" />
    </div>
  );
}

function FileGlyph({ file }: { file: ProjectFile }) {
  if (file.kind === 'folder') return <Folder size={14} className="file-icon folder-icon" />;
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (['lua', 'luau', 'ts', 'tsx', 'js'].includes(ext || '')) return <FileCode2 size={14} className="file-icon code-icon" />;
  if (ext === 'json') return <FileJson size={14} className="file-icon json-icon" />;
  return <FileText size={14} className="file-icon" />;
}


type MarkdownBlockNode = ReactNode;

function renderInlineMarkdown(value: string, keyPrefix: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|\*[^*\n]+\*|~~[^~]+~~|\x60[^\x60]+\x60|\[([^\]]+)\]\((https:\/\/[^)\s]+)\))/g;
  const output: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let part = 0;

  while ((match = pattern.exec(value)) !== null) {
    if (match.index > cursor) output.push(value.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      output.push(<strong key={keyPrefix + "-b-" + part}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("~~")) {
      output.push(<del key={keyPrefix + "-d-" + part}>{token.slice(2, -2)}</del>);
    } else if (token.startsWith("*")) {
      output.push(<em key={keyPrefix + "-i-" + part}>{token.slice(1, -1)}</em>);
    } else if (token.charCodeAt(0) === 96) {
      output.push(<code className="inline-code" key={keyPrefix + "-c-" + part}>{token.slice(1, -1)}</code>);
    } else {
      const label = match[2] || token;
      const url = match[3];
      output.push(
        <a
          href={url}
          key={keyPrefix + "-a-" + part}
          onClick={event => { event.preventDefault(); void window.rmango.openExternal(url).catch(() => undefined); }}
          rel="noreferrer noopener"
          title={url}
        >{label}</a>
      );
    }
    cursor = match.index + token.length;
    part += 1;
  }
  if (cursor < value.length) output.push(value.slice(cursor));
  return output;
}

async function writeClipboardText(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {
    // Fall through to the compatible Electron/document copy path.
  }

  const field = document.createElement('textarea');
  field.value = value;
  field.setAttribute('readonly', '');
  field.setAttribute('aria-hidden', 'true');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  field.style.pointerEvents = 'none';
  field.style.left = '-9999px';
  document.body.appendChild(field);
  field.select();
  field.setSelectionRange(0, field.value.length);
  const copied = document.execCommand('copy');
  field.remove();
  if (!copied) throw new Error('Clipboard access is unavailable.');
}

function MessageCodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  async function copyCode() {
    try {
      await writeClipboardText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="chat-code-block">
      <div className="chat-code-header">
        <span>{language || "code"}</span>
        <button type="button" onClick={() => void copyCode()} title="Copy code" aria-label="Copy code">
          {copied ? <Check size={12}/> : <Copy size={12}/>}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

function MessageContent({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlockNode[] = [];
  let index = 0;
  let blockKey = 0;
  const fence = String.fromCharCode(96).repeat(3);
  const isBlockStart = (line: string) =>
    line.trimStart().startsWith(fence) ||
    /^#{1,4}\s+/.test(line) ||
    /^\s*>/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    /^\s*(?:---+|\*\*\*+)\s*$/.test(line);
  const isTableDivider = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
  const splitTableCells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());


  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    const trimmed = line.trim();
    if (trimmed.startsWith(fence)) {
      const language = trimmed.slice(3).trim().split(/\s+/)[0] || "";
      index += 1;
      const codeLines: string[] = [];
      while (index < lines.length && !lines[index].trim().startsWith(fence)) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(<MessageCodeBlock key={"code-" + blockKey++} code={codeLines.join("\n")} language={language}/>);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = Math.min(4, heading[1].length);
      const children = renderInlineMarkdown(heading[2], "h-" + blockKey);
      const key = "heading-" + blockKey++;
      if (level === 1) blocks.push(<h2 key={key}>{children}</h2>);
      else if (level === 2) blocks.push(<h3 key={key}>{children}</h3>);
      else if (level === 3) blocks.push(<h4 key={key}>{children}</h4>);
      else blocks.push(<h5 key={key}>{children}</h5>);
      index += 1;
      continue;
    }

    if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) {
      blocks.push(<hr key={"hr-" + blockKey++}/>);
      index += 1;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(<blockquote key={"quote-" + blockKey++}>{renderInlineMarkdown(quote.join(" "), "q-" + blockKey)}</blockquote>);
      continue;
    }

    if (line.includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      const headers = splitTableCells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim() && lines[index].includes("|")) {
        rows.push(splitTableCells(lines[index]));
        index += 1;
      }
      blocks.push(
        <div className="chat-table-wrap" key={"table-" + blockKey++}>
          <table className="chat-markdown-table">
            <thead><tr>{headers.map((header, cellIndex) => <th key={"th-" + cellIndex}>{renderInlineMarkdown(header, "th-" + blockKey + "-" + cellIndex)}</th>)}</tr></thead>
            <tbody>{rows.map((row, rowIndex) =>
              <tr key={"tr-" + rowIndex}>
                {headers.map((_, cellIndex) => <td key={"td-" + rowIndex + "-" + cellIndex}>{renderInlineMarkdown(row[cellIndex] || "", "td-" + blockKey + "-" + rowIndex + "-" + cellIndex)}</td>)}
              </tr>
            )}</tbody>
          </table>
        </div>
      );
      continue;
    }

    const unordered = /^\s*[-*+]\s+/.test(line);
    const ordered = /^\s*\d+[.)]\s+/.test(line);
    if (unordered || ordered) {
      const items: string[] = [];
      const matcher = unordered ? /^\s*[-*+]\s+(.*)$/ : /^\s*\d+[.)]\s+(.*)$/;
      while (index < lines.length && matcher.test(lines[index])) {
        items.push(lines[index].replace(matcher, "$1"));
        index += 1;
      }
      const listItems = items.map((item, itemIndex) => <li key={"li-" + itemIndex}>{renderInlineMarkdown(item, "li-" + blockKey + "-" + itemIndex)}</li>);
      blocks.push(unordered
        ? <ul key={"ul-" + blockKey++}>{listItems}</ul>
        : <ol key={"ol-" + blockKey++}>{listItems}</ol>);
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    if (!paragraph.length) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(<p key={"p-" + blockKey++}>{renderInlineMarkdown(paragraph.join(" "), "p-" + blockKey)}</p>);
  }

  return <div className="message-markdown">{blocks}</div>;
}

function encodeTextBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(binary);
}

function encodeBytesBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(binary);
}

function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read ' + file.name + '.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

function inferMimeType(file: File) {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  const textExts = ['lua', 'luau', 'txt', 'md', 'csv', 'toml', 'yaml', 'yml', 'js', 'jsx', 'ts', 'tsx', 'css', 'html', 'xml'];
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === 'json') return 'application/json';
  if (textExts.includes(ext || '')) return 'text/plain';
  return 'application/octet-stream';
}

function App() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [cloudState, setCloudState] = useState<CloudState | null>(null);
  const [cloudModels, setCloudModels] = useState<CloudModels | null>(null);
  const [cloudUsage, setCloudUsage] = useState<CloudUsage | null>(null);
  const [cloudProfile, setCloudProfile] = useState<CloudProfile>('developer');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [cloudConversations, setCloudConversations] = useState<CloudConversation[]>([]);
  const [cloudTasks, setCloudTasks] = useState<CloudAgentTask[]>([]);
  const [cloudProjects, setCloudProjects] = useState<CloudProject[]>([]);
  const [cloudProjectSearch, setCloudProjectSearch] = useState('');
  const [projectDialog, setProjectDialog] = useState<ProjectDialogState>(null);
  const [savingProject, setSavingProject] = useState(false);
  const [loadingConversationId, setLoadingConversationId] = useState<string | null>(null);
  const [chatReady, setChatReady] = useState(false);
  const [cloudProjectId, setCloudProjectId] = useState<string | undefined>();
  const [cloudProjectChanges, setCloudProjectChanges] = useState<CloudProjectChange[]>([]);
  const [projectChangesOpen, setProjectChangesOpen] = useState(false);
  const [reviewingChangeId, setReviewingChangeId] = useState<string | null>(null);
  const [uploadingProject, setUploadingProject] = useState(false);
  const [projectUploadProgress, setProjectUploadProgress] = useState<{ completed: number; total: number; uploaded: number; skipped: number; currentFile: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [studioTools, setStudioTools] = useState<string[]>([]);
  const [studioReady, setStudioReady] = useState(false);
  const [studioInstances, setStudioInstances] = useState<StudioInstance[]>([]);
  const [selectedStudioId, setSelectedStudioId] = useState<string | undefined>();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [followupQueue, setFollowupQueue] = useState<PendingFollowup[]>([]);
  const followupQueueRef = useRef<PendingFollowup[]>([]);
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general');
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [sendOnEnter, setSendOnEnter] = useState(true);
  const [desktopNotifications, setDesktopNotifications] = useState(false);
  const [autoUpdatesEnabled, setAutoUpdatesEnabled] = useState(true);
  const [saveLocalChatHistory, setSaveLocalChatHistory] = useState(true);
  const [showInspectorByDefault, setShowInspectorByDefault] = useState(true);
  const [cloudRefreshing, setCloudRefreshing] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [toast, setToast] = useState('');
  const [diagnosticResult, setDiagnosticResult] = useState('');
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authResetBusy, setAuthResetBusy] = useState(false);
  const [authResetSent, setAuthResetSent] = useState(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState('');
  const [authVerificationFeedback, setAuthVerificationFeedback] = useState('');
  const [authVerificationError, setAuthVerificationError] = useState(false);
  const [authVerificationBusy, setAuthVerificationBusy] = useState(false);
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [search, setSearch] = useState('');
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [pendingApproval, setPendingApproval] = useState<StudioApprovalRequest | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [cloudLoading, setCloudLoading] = useState(true);
  const [studioCloudLinked, setStudioCloudLinked] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const cancelledRequestIdRef = useRef<string | null>(null);
  const pendingDeltasRef = useRef<Map<string, string>>(new Map());
  const completedRequestsRef = useRef<Set<string>>(new Set());
  const deltaFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const onWorkspaceShortcut = (event: globalThis.KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier && key === ',') {
        event.preventDefault();
        setSettingsSection('general');
        setSettingsOpen(true);
      } else if (modifier && key === 'b') {
        event.preventDefault();
        setLeftSidebarCollapsed(value => !value);
        setLeftSidebarOpen(true);
      } else if (modifier && event.shiftKey && key === 'i') {
        event.preventDefault();
        setRightPanelOpen(value => !value);
      } else if (modifier && key === 'l') {
        event.preventDefault();
        composerRef.current?.focus();
      } else if (event.key === 'Escape') {
        if (settingsOpen) setSettingsOpen(false);
        else if (rightPanelOpen) setRightPanelOpen(false);
        else if (leftSidebarOpen) setLeftSidebarOpen(false);
        else if (leftSidebarCollapsed) setLeftSidebarCollapsed(false);
      }
    };
    window.addEventListener('keydown', onWorkspaceShortcut);
    return () => window.removeEventListener('keydown', onWorkspaceShortcut);
  }, [settingsOpen, rightPanelOpen, leftSidebarOpen, leftSidebarCollapsed]);

  useEffect(() => {
    const unsubscribeUpdates = window.rmango.onUpdateStatus(state => setUpdateState(state));
    // Coalesce chunks into one render per frame. Keep request completion state
    // so delayed IPC events cannot append duplicate text after the final response.
    const flushDeltas = () => {
      deltaFrameRef.current = null;
      if (pendingDeltasRef.current.size === 0) return;
      const batch = new Map(pendingDeltasRef.current);
      pendingDeltasRef.current.clear();
      setMessages(current => current.map(message => {
        const id = message.id || '';
        const delta = completedRequestsRef.current.has(id) ? undefined : batch.get(id);
        return delta ? { ...message, content: message.content + delta } : message;
      }));
    };
    const unsubscribeDeltas = window.rmango.onCloudChatDelta(({ requestId, delta }) => {
      if (completedRequestsRef.current.has(requestId)) return;
      pendingDeltasRef.current.set(requestId, (pendingDeltasRef.current.get(requestId) || '') + delta);
      if (deltaFrameRef.current === null) deltaFrameRef.current = window.requestAnimationFrame(flushDeltas);
    });
    const unsubscribeActivities = window.rmango.onCloudChatActivity(({ requestId, activity }) => {
      if (completedRequestsRef.current.has(requestId)) return;
      setActivities(current => {
        const incoming = { ...activity, requestId };
        const key = incoming.id || incoming.name;
        const existingIndex = current.findIndex(item => item.requestId === requestId && (item.id || item.name) === key);
        if (existingIndex < 0) return [...current, incoming].slice(-80);
        const next = [...current];
        next[existingIndex] = incoming;
        return next;
      });
    });
    const unsubscribeProjectUpload = window.rmango.onProjectUploadProgress(progress => {
      setProjectUploadProgress(progress);
    });
    void window.rmango.getUpdateState().then(setUpdateState).catch(() => undefined);

    Promise.all([window.rmango.getAppState(), window.rmango.getCloudState(), window.rmango.loadMessages()])
      .then(async ([state, cloud, savedMessages]) => {
        setAppState(state);
        setTheme(state.appearance || 'dark');
        setDensity(state.density || 'comfortable');
        setAnimationsEnabled(state.animationsEnabled !== false);
        setReducedMotion(Boolean(state.reducedMotion));
        setFontSize(state.fontSize || 'medium');
        setSendOnEnter(state.sendOnEnter !== false);
        setDesktopNotifications(Boolean(state.desktopNotifications));
        setAutoUpdatesEnabled(state.autoUpdatesEnabled !== false);
        setCloudProfile(state.defaultCloudProfile || 'developer');
        setSaveLocalChatHistory(state.saveLocalChatHistory !== false);
        setShowInspectorByDefault(state.showInspectorByDefault !== false);
        setRightPanelOpen(state.showInspectorByDefault !== false);
        setProjectFiles(state.projectFiles || []);
        setCloudState(cloud);
        if (cloud.signedIn) {
          void window.rmango.getCloudUsage().then(setCloudUsage).catch(() => setCloudUsage(null));
        } else {
          setCloudUsage(null);
        }
        setConversationId(cloud.currentConversationId || undefined);
        if (cloud.currentProjectId) {
          setCloudProjectId(cloud.currentProjectId);
          try {
            const changeList = await window.rmango.getCloudProjectChanges(cloud.currentProjectId);
            setCloudProjectChanges(changeList.changes || []);
          } catch { /* Existing cloud project may no longer be accessible. */ }
        }
        let restoredMessages = savedMessages || [];
        if (state.studioConnected) void refreshMcpState();
        if (cloud.signedIn && cloud.serviceReady) {
          const [modelsResult, conversationsResult, tasksResult, projectsResult] = await Promise.allSettled([
            window.rmango.getCloudModels(),
            window.rmango.getCloudConversations(),
            window.rmango.getCloudTasks(),
            window.rmango.getCloudProjects(),
          ]);

          // A history/workspace endpoint can be deployed separately from the
          // chat endpoint. Never let an optional feature outage block real AI chat.
          if (modelsResult.status === 'fulfilled') {
            setCloudModels(modelsResult.value);
          } else {
            setToast(modelsResult.reason instanceof Error ? modelsResult.reason.message : 'Could not load cloud model profiles.');
          }
          setCloudConversations(conversationsResult.status === 'fulfilled' ? conversationsResult.value : []);
          setCloudTasks(tasksResult.status === 'fulfilled' ? tasksResult.value : []);
          setCloudProjects(projectsResult.status === 'fulfilled' ? projectsResult.value : []);

          if (cloud.currentConversationId) {
            try {
              const restored = await window.rmango.loadCloudConversation(cloud.currentConversationId);
              if (restored.messages.length) restoredMessages = restored.messages;
              const restoredProjectId = restored.conversation.project_id || null;
              setCloudProjectId(restoredProjectId || undefined);
              await window.rmango.setCurrentCloudProjectId(restoredProjectId);
              try {
                setCloudTasks(await window.rmango.getCloudTasks(restoredProjectId || undefined));
              } catch {
                // The transcript and real chat request are independent of task history.
              }
            } catch {
              // Keep the encrypted local transcript if the cloud history API is not
              // deployed yet. The chat endpoint can still resume using its saved ID.
            }
          }
        }
        setMessages(restoredMessages);
        setChatReady(true);
      })
      .catch(() => setToast('Could not load Rmango cloud state. Check the backend configuration.'))
      .finally(() => setCloudLoading(false));

    return () => {
      unsubscribeUpdates();
      if (deltaFrameRef.current !== null) window.cancelAnimationFrame(deltaFrameRef.current);
      deltaFrameRef.current = null;
      pendingDeltasRef.current.clear();
      unsubscribeDeltas();
      unsubscribeActivities();
      unsubscribeProjectUpload();
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: busy ? 'auto' : 'smooth', block: 'end' });
  }, [messages, busy, pendingApproval]);

  const latestMessagesRef = useRef(messages);
  const chatSaveTimerRef = useRef<number | null>(null);
  latestMessagesRef.current = messages;

  // Persist at most once per second while tokens stream, rather than writing the
  // complete chat history for every network chunk.
  useEffect(() => {
    if (!chatReady || chatSaveTimerRef.current !== null) return;
    chatSaveTimerRef.current = window.setTimeout(() => {
      chatSaveTimerRef.current = null;
      void window.rmango.saveMessages(latestMessagesRef.current);
    }, 1000);
  }, [messages, chatReady]);

  useEffect(() => () => {
    if (chatSaveTimerRef.current !== null) {
      window.clearTimeout(chatSaveTimerRef.current);
      chatSaveTimerRef.current = null;
      if (latestMessagesRef.current.length) void window.rmango.saveMessages(latestMessagesRef.current);
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => window.rmango.onToolApproval(request => {
    setPendingApproval(request);
    setApprovalBusy(false);
  }), []);

  async function refreshMcpState() {
    const state = await window.rmango.getMcpState();
    setStudioTools(state.tools || []);
    setStudioReady(Boolean(state.studioReady));
    setStudioInstances(state.studioInstances || []);
    setSelectedStudioId(state.studioId || undefined);
    setStudioCloudLinked(Boolean(state.cloudLinked));
    setAppState(prev => prev ? { ...prev, studioConnected: state.connected, studioToolCount: state.toolCount } : prev);
    return state;
  }

  async function refreshCloudState() {
    const state = await window.rmango.getCloudState();
    setCloudState(state);
    if (state.signedIn) {
      void window.rmango.getCloudUsage().then(setCloudUsage).catch(() => setCloudUsage(null));
    } else {
      setCloudUsage(null);
    }
    if (state.signedIn && state.serviceReady) {
      setConversationId(state.currentConversationId || undefined);
      const [modelsResult, conversationsResult, tasksResult, projectsResult] = await Promise.allSettled([
        window.rmango.getCloudModels(),
        window.rmango.getCloudConversations(),
        window.rmango.getCloudTasks(),
        window.rmango.getCloudProjects(),
      ]);
      if (modelsResult.status === 'fulfilled') setCloudModels(modelsResult.value);
      else setToast(modelsResult.reason instanceof Error ? modelsResult.reason.message : 'Could not load cloud model profiles.');
      setCloudConversations(conversationsResult.status === 'fulfilled' ? conversationsResult.value : []);
      setCloudTasks(tasksResult.status === 'fulfilled' ? tasksResult.value : []);
      setCloudProjects(projectsResult.status === 'fulfilled' ? projectsResult.value : []);
    } else {
      setCloudModels(null);
      setCloudConversations([]);
      setCloudTasks([]);
      setCloudProjects([]);
    }
    return state;
  }

  async function handleSaveCloudProject() {
    if (!projectDialog || savingProject) return;
    const name = projectDialog.name.trim();
    if (!name || name.length > 100) {
      setToast('Project names must contain between 1 and 100 characters.');
      return;
    }
    setSavingProject(true);
    try {
      if (projectDialog.mode === 'create') {
        const project = await window.rmango.createCloudProject({
          name,
          description: projectDialog.description.trim(),
        });
        setCloudProjects(current => [project, ...current.filter(item => item.id !== project.id)].slice(0, 50));
        setCloudProjectId(project.id);
        setCloudState(current => current ? { ...current, currentProjectId: project.id } : current);
        await window.rmango.setCurrentCloudProjectId(project.id);
        setConversationId(undefined);
        setMessages([]);
        setActivities([]);
        await window.rmango.setCurrentConversationId(null);
        setCloudProjectChanges([]);
        setCloudTasks([]);
        setToast('Created project "' + project.name + '".');
      } else if (projectDialog.projectId) {
        const project = await window.rmango.updateCloudProject({
          projectId: projectDialog.projectId,
          name,
          description: projectDialog.description.trim(),
        });
        setCloudProjects(current => current.map(item => item.id === project.id ? project : item));
        setToast('Updated project "' + project.name + '".');
      }
      setProjectDialog(null);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not save the cloud project.');
    } finally {
      setSavingProject(false);
    }
  }

  async function handleSelectCloudProject(project: CloudProject) {
    if (busy || loadingConversationId) return;
    if (cloudProjectId === project.id) return;
    try {
      await window.rmango.setCurrentCloudProjectId(project.id);
      await window.rmango.setCurrentConversationId(null);
      const projectTasks = await window.rmango.getCloudTasks(project.id).catch(() => []);
      setCloudProjectId(project.id);
      setCloudState(current => current ? { ...current, currentProjectId: project.id, currentConversationId: undefined } : current);
      setConversationId(undefined);
      setMessages([]);
      setActivities([]);
      setCloudTasks(projectTasks);
      setFollowupQueue([]);
      followupQueueRef.current = [];
      setCloudProjectChanges([]);
      setToast('Switched to project "' + project.name + '". Start a chat to give RMango this project context.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not select this project.');
    }
  }

  function openRenameProject(project: CloudProject) {
    setProjectDialog({
      mode: 'rename',
      projectId: project.id,
      name: project.name,
      description: project.description || '',
    });
  }

  async function handleDeleteCloudProject(project: CloudProject) {
    if (busy || !window.confirm('Delete "' + project.name + '" and its private project files, saved memories and proposed changes? This cannot be undone.')) return;
    try {
      const result = await window.rmango.deleteCloudProject(project.id);
      setCloudProjects(current => current.filter(item => item.id !== project.id));
      if (cloudProjectId === project.id) {
        await window.rmango.setCurrentCloudProjectId(null);
        setCloudProjectId(undefined);
        setCloudState(current => current ? { ...current, currentProjectId: undefined } : current);
        setCloudProjectChanges([]);
      }
      setToast('Deleted project "' + project.name + '" and ' + result.deletedFileCount + ' private files.');
      const [conversations, tasks] = await Promise.all([
        window.rmango.getCloudConversations(),
        window.rmango.getCloudTasks(),
      ]);
      setCloudConversations(conversations);
      setCloudTasks(tasks);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not delete the cloud project. No project database row was removed unless the operation completed.');
    }
  }

  const filteredCloudProjects = useMemo(() => {
    const query = cloudProjectSearch.trim().toLocaleLowerCase();
    return query
      ? cloudProjects.filter(project => project.name.toLocaleLowerCase().includes(query) || project.description.toLocaleLowerCase().includes(query))
      : cloudProjects;
  }, [cloudProjects, cloudProjectSearch]);

  async function handleNewConversation() {
    if (busy || loadingConversationId) return;
    if (!cloudState?.signedIn || !cloudState.serviceReady) {
      setSettingsSection('account');
      setSettingsOpen(true);
      setToast('Sign in to Rmango Cloud before starting a new cloud conversation.');
      return;
    }
    try {
      const conversation = await window.rmango.createCloudConversation({
        title: 'New chat',
        projectId: cloudProjectId,
        modelProfile: cloudProfile,
      });
      setConversationId(conversation.id);
      setCloudState(current => current ? { ...current, currentConversationId: conversation.id } : current);
      setMessages([]);
      setActivities([]);
      setFollowupQueue([]);
      followupQueueRef.current = [];
      await window.rmango.setCurrentConversationId(conversation.id);
      setCloudConversations(current => [conversation, ...current.filter(item => item.id !== conversation.id)].slice(0, 50));
      setToast('Started a new conversation' + (cloudProjectId ? ' in this project.' : '.'));
      composerRef.current?.focus();
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not create a new conversation.');
    }
  }

  async function handleSelectConversation(id: string) {
    if (busy || loadingConversationId || id === conversationId) return;
    setLoadingConversationId(id);
    try {
      const loaded = await window.rmango.loadCloudConversation(id);
      const activeProjectId = loaded.conversation.project_id || null;
      await window.rmango.setCurrentConversationId(id);
      await window.rmango.setCurrentCloudProjectId(activeProjectId);
      const projectTasks = await window.rmango.getCloudTasks(activeProjectId || undefined);
      setConversationId(id);
      setCloudState(current => current ? {
        ...current,
        currentConversationId: id,
        currentProjectId: activeProjectId || undefined,
      } : current);
      setCloudProjectId(activeProjectId || undefined);
      setCloudTasks(projectTasks);
      setMessages(loaded.messages || []);
      setActivities([]);
      setFollowupQueue([]);
      followupQueueRef.current = [];
      setCloudConversations(current => [
        loaded.conversation,
        ...current.filter(item => item.id !== loaded.conversation.id),
      ]);
      setToast('Resumed "' + loaded.conversation.title + '".');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not resume this conversation.');
    } finally {
      setLoadingConversationId(null);
    }
  }

  async function handlePasswordReset() {
    const email = authEmail.trim().toLowerCase();
    if (!email || authResetBusy) return;
    setAuthResetBusy(true);
    setAuthResetSent(false);
    try {
      const result = await window.rmango.requestPasswordReset({ email });
      setAuthResetSent(true);
      setToast(result.message || 'If an account exists, a recovery email has been sent.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not request a password reset.');
    } finally {
      setAuthResetBusy(false);
    }
  }

  async function handleResendEmailConfirmation() {
    const email = (pendingVerificationEmail || cloudState?.email || authEmail).trim().toLowerCase();
    if (!email || authVerificationBusy) return;
    setAuthVerificationBusy(true);
    setAuthVerificationFeedback('');
    setAuthVerificationError(false);
    try {
      const result = await window.rmango.resendEmailConfirmation({ email });
      setAuthVerificationFeedback(result.message || 'Check your inbox for a confirmation email.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not request a confirmation email.';
      setAuthVerificationFeedback(message);
      setAuthVerificationError(true);
    } finally {
      setAuthVerificationBusy(false);
    }
  }

  async function handleAuth(event: FormEvent) {
    event.preventDefault();
    if (authBusy) return;
    setAuthBusy(true);
    try {
      const normalizedEmail = authEmail.trim().toLowerCase();
      if (authMode === 'sign-in') {
        await window.rmango.cloudSignIn({ email: normalizedEmail, password: authPassword });
        setPendingVerificationEmail('');
        setAuthVerificationFeedback('');
        setAuthVerificationError(false);
      } else {
        const result = await window.rmango.cloudSignUp({
          email: normalizedEmail,
          password: authPassword,
          displayName: authDisplayName.trim() || undefined,
        });
        if (result.requiresEmailConfirmation) {
          setPendingVerificationEmail(normalizedEmail);
          setAuthVerificationFeedback('A confirmation link was requested. Open it on this device or another device, then return here and sign in.');
          setAuthVerificationError(false);
          setToast('Check your inbox to verify your Rmango account.');
          setAuthMode('sign-in');
          setAuthPassword('');
          return;
        }
      }
      setAuthPassword('');
      const state = await refreshCloudState();
      setMessages([]);
      setActivities([]);
      if (state.signedIn && state.currentConversationId) {
        try {
          const restored = await window.rmango.loadCloudConversation(state.currentConversationId);
          setConversationId(restored.conversation.id);
          setMessages(restored.messages);
          const restoredProjectId = restored.conversation.project_id || null;
          setCloudProjectId(restoredProjectId || undefined);
          await window.rmango.setCurrentCloudProjectId(restoredProjectId);
          setCloudTasks(await window.rmango.getCloudTasks(restoredProjectId || undefined));
        } catch (error) {
          setConversationId(undefined);
          setToast(error instanceof Error ? error.message : 'Signed in, but the last conversation could not be restored.');
        }
      } else {
        setConversationId(undefined);
      }
      if (state.signedIn) {
        try {
          const [tasks, projects] = await Promise.all([
            window.rmango.getCloudTasks(),
            window.rmango.getCloudProjects(),
          ]);
          setCloudTasks(tasks);
          setCloudProjects(projects);
        } catch {
          setCloudTasks([]);
          setCloudProjects([]);
        }
      }
      if (appState?.studioConnected) await refreshMcpState();
      setToast(state.serviceReady ? 'Signed in to Rmango Cloud.' : (state.message || 'Signed in, but cloud services need administrator setup.'));
      if (state.serviceReady) setSettingsOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not authenticate with Rmango Cloud.';
      if (authMode === 'sign-in' && /(email.*confirm|confirm.*email|email.*verif|verif.*email)/i.test(message)) {
        setPendingVerificationEmail(authEmail.trim().toLowerCase());
        setAuthVerificationFeedback('This account still needs email confirmation. Request a fresh link below, then sign in.');
        setAuthVerificationError(false);
      }
      setToast(message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function savePreferences(patch: Partial<AppPreferences>) {
    try {
      const result = await window.rmango.updateSettings(patch);
      setAppState(current => current ? { ...current, ...result.settings } : current);
      return true;
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not save Rmango settings.');
      return false;
    }
  }

  async function handleResetPreferences() {
    const defaults: AppPreferences = {
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
    if (!await savePreferences(defaults)) return;
    setTheme(defaults.appearance);
    setDensity(defaults.density);
    setAnimationsEnabled(defaults.animationsEnabled);
    setReducedMotion(defaults.reducedMotion);
    setFontSize(defaults.fontSize);
    setSendOnEnter(defaults.sendOnEnter);
    setDesktopNotifications(defaults.desktopNotifications);
    setAutoUpdatesEnabled(defaults.autoUpdatesEnabled);
    setCloudProfile(defaults.defaultCloudProfile);
    setSaveLocalChatHistory(defaults.saveLocalChatHistory);
    setShowInspectorByDefault(defaults.showInspectorByDefault);
    setRightPanelOpen(defaults.showInspectorByDefault);
    setToast('Settings restored to their defaults. Your account and cloud projects were not changed.');
  }

  async function handleClearLocalChatCache() {
    try {
      await window.rmango.saveMessages([]);
      setMessages([]);
      setToast('Local chat cache cleared. Your saved cloud conversations were not deleted.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not clear the local chat cache.');
    }
  }

  async function handleThemeChange(nextTheme: 'dark' | 'light' | 'system') {
    const previous = theme;
    setTheme(nextTheme);
    if (!await savePreferences({ appearance: nextTheme })) setTheme(previous);
  }

  async function handleDefaultProfileChange(profile: CloudProfile) {
    const previous = cloudProfile;
    setCloudProfile(profile);
    if (!await savePreferences({ defaultCloudProfile: profile })) setCloudProfile(previous);
  }

  async function handleLocalHistoryChange(enabled: boolean) {
    const previous = saveLocalChatHistory;
    setSaveLocalChatHistory(enabled);
    const saved = await savePreferences({ saveLocalChatHistory: enabled });
    if (!saved) {
      setSaveLocalChatHistory(previous);
      return;
    }
    if (!enabled) {
      setToast('Local chat caching is off. Cloud conversation history remains in your account.');
    }
  }

  async function handleInspectorDefaultChange(enabled: boolean) {
    const previous = showInspectorByDefault;
    setShowInspectorByDefault(enabled);
    if (!await savePreferences({ showInspectorByDefault: enabled })) {
      setShowInspectorByDefault(previous);
    }
  }

  async function handleRefreshUsage() {
    setCloudRefreshing(true);
    try {
      const usage = await window.rmango.getCloudUsage();
      setCloudUsage(usage);
      setToast('Usage information refreshed.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not refresh usage information.');
    } finally {
      setCloudRefreshing(false);
    }
  }

  async function handleRefreshCloud() {
    setCloudRefreshing(true);
    try {
      const state = await refreshCloudState();
      setToast(state.serviceReady ? (state.signedIn ? 'Cloud AI is ready.' : 'Cloud service is ready. Sign in to continue.') : (state.message || 'Cloud setup is incomplete.'));
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Cloud health check failed.');
    } finally {
      setCloudRefreshing(false);
    }
  }

  async function handleSignOut() {
    try {
      await window.rmango.cloudSignOut();
      setCloudState(await window.rmango.getCloudState());
      setCloudModels(null);
      setCloudUsage(null);
      setCloudConversations([]);
      setCloudTasks([]);
      setCloudProjects([]);
      setCloudProjectId(undefined);
      setConversationId(undefined);
      setMessages([]);
      setActivities([]);
      setFollowupQueue([]);
      followupQueueRef.current = [];
      if (appState?.studioConnected) await refreshMcpState();
      setToast('Signed out of Rmango Cloud.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not sign out.');
    }
  }

  async function handleCheckUpdates() {
    try {
      const state = await window.rmango.checkForUpdates();
      setUpdateState(state);
      if (state.status === 'not-available') setToast('Rmango is already up to date.');
      else if (state.status === 'unsupported') setToast(state.message || 'Updates are available in the installed Windows app.');
      else if (state.status === 'error') setToast(state.error || 'Could not check for updates.');
      else if (state.status === 'checking') setToast('Checking GitHub Releases…');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not check for updates.');
    }
  }

  async function handleInstallUpdate() {
    try {
      const result = await window.rmango.installUpdate();
      if (!result.ok) setToast(result.message || 'The update is not ready to install.');
      else setToast(result.message || 'Restarting to install the update…');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not install the update.');
    }
  }

  async function handleUploadProject() {
    if (!appState?.projectPath || uploadingProject) return;
    if (!cloudState?.configured || !cloudState.serviceReady || !cloudState.signedIn) {
      setSettingsSection('account');
      setSettingsOpen(true);
      setToast('Sign in to a configured Rmango Cloud account before uploading this project.');
      return;
    }
    const previousCloudProjectId = cloudProjectId;
    setUploadingProject(true);
    setProjectUploadProgress({ completed: 0, total: 0, uploaded: 0, skipped: 0, currentFile: 'Preparing project…' });
    try {
      const result = await window.rmango.uploadCloudProject();
      const changedProject = previousCloudProjectId !== result.projectId;
      if (changedProject) {
        await window.rmango.setCurrentConversationId(null);
        setConversationId(undefined);
        setMessages([]);
        setActivities([]);
        setFollowupQueue([]);
        followupQueueRef.current = [];
      }
      setCloudProjectId(result.projectId);
      const projectTasks = await window.rmango.getCloudTasks(result.projectId).catch(() => []);
      setCloudTasks(projectTasks);
      await window.rmango.setCurrentCloudProjectId(result.projectId);
      setCloudState(current => current ? { ...current, currentProjectId: result.projectId } : current);
      const [changeList, projects] = await Promise.all([
        window.rmango.getCloudProjectChanges(result.projectId),
        window.rmango.getCloudProjects(),
      ]);
      setCloudProjectChanges(changeList.changes || []);
      setCloudProjects(projects);
      setToast(
        'Synced "' + result.projectName + '": ' + result.uploaded + ' files uploaded or updated, ' +
        result.unchanged + ' unchanged, ' + result.removed + ' removed.' +
        (changedProject ? ' Started a fresh project conversation.' : '') +
        (result.skipped.length ? ' ' + result.skipped.length + ' files could not be synced.' : '')
      );
      if (result.skipped.length) {
        setActivities(current => [
          ...current,
          { name: 'Project import', detail: result.skipped.length + ' files skipped; unsupported or over the 512 KB text limit.', ok: false },
        ]);
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not upload this project to Rmango Cloud.');
    } finally {
      setUploadingProject(false);
      setProjectUploadProgress(null);
    }
  }

  async function handleLoadProjectChanges() {
    if (!cloudProjectId) return;
    try {
      const result = await window.rmango.getCloudProjectChanges(cloudProjectId);
      setCloudProjectChanges(result.changes || []);
      setProjectChangesOpen(true);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not load cloud project changes.');
    }
  }

  async function handleReviewProjectChange(change: CloudProjectChange, decision: 'approve' | 'reject') {
    if (!cloudProjectId || reviewingChangeId) return;
    setReviewingChangeId(change.id);
    try {
      await window.rmango.reviewCloudProjectChange({
        projectId: cloudProjectId,
        changeId: change.id,
        decision,
      });
      const result = await window.rmango.getCloudProjectChanges(cloudProjectId);
      setCloudProjectChanges(result.changes || []);
      setToast(decision === 'approve'
        ? 'Approved and applied ' + change.relative_path + ' in the cloud workspace.'
        : 'Rejected the proposed change to ' + change.relative_path + '.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not review the proposed change.');
      if (cloudProjectId) {
        try {
          const result = await window.rmango.getCloudProjectChanges(cloudProjectId);
          setCloudProjectChanges(result.changes || []);
        } catch { /* Keep the previous review list visible. */ }
      }
    } finally {
      setReviewingChangeId(null);
    }
  }

  async function handleDownloadCloudProject() {
    if (!cloudProjectId) return;
    try {
      const result = await window.rmango.downloadCloudProject(cloudProjectId);
      if (!result.canceled) setToast('Downloaded the cloud project ZIP to ' + result.path);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not download the cloud project.');
    }
  }

  async function handleConnect() {
    setConnecting(true);
    try {
      const result = await window.rmango.connectRoblox();
      if (result.ok) {
        const state = await refreshMcpState();
        if (!state.studioReady) {
          setToast('Roblox MCP bridge is connected, but no open Studio place is available. Open your place in Studio, then refresh this connection.');
        } else if (state.cloudLinked) {
          setToast('Connected to ' + (studioInstances.find(item => item.id === state.studioId)?.name || 'Roblox Studio') + ' · ' + state.toolCount + ' tools available to RMango.');
        } else {
          setToast('Studio place connected locally. ' + (result.cloudMessage || 'Sign in to Rmango Cloud to enable AI actions.'));
        }
      } else {
        setToast(result.error || 'Could not connect to Roblox Studio.');
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Connection failed.');
    } finally {
      setConnecting(false);
    }
  }

  async function handleSelectStudioInstance(studioId: string) {
    if (!studioId || studioId === selectedStudioId) return;
    try {
      await window.rmango.selectStudioInstance(studioId);
      const state = await refreshMcpState();
      const instance = state.studioInstances.find(item => item.id === studioId);
      setToast('RMango is now targeting ' + (instance?.name || 'the selected Roblox Studio place') + '.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not select that Studio instance.');
      await refreshMcpState().catch(() => undefined);
    }
  }

  async function handleDisconnect() {
    await window.rmango.disconnectRoblox();
    await refreshMcpState();
    setToast('Roblox Studio disconnected.');
  }

  async function handleOpenProject() {
    const result = await window.rmango.openProject();
    if (result.canceled) return;
    setProjectFiles(result.files || []);
    setAppState(prev => prev ? { ...prev, projectPath: result.path || '' } : prev);
    setToast('Project folder added to Rmango.');
  }

  async function handleDiagnostics() {
    setDiagnosing(true);
    setDiagnosticResult('');
    try {
      const result = await window.rmango.runDiagnostics();
      const report = (result.checks || []).map((check: any) => (check.ok ? '✓ ' : '× ') + check.name + '\n' + check.detail).join('\n\n');
      setDiagnosticResult(report || result.error || 'No diagnostic tools were available.');
      setActivities((result.checks || []).map((check: any) => ({ name: check.name, detail: check.ok ? 'Studio diagnostic completed' : check.detail, ok: check.ok })));
      setToast(result.ok ? 'Studio diagnostics completed.' : 'Diagnostics completed with warnings.');
    } catch (error) {
      setDiagnosticResult(error instanceof Error ? error.message : String(error));
    } finally {
      setDiagnosing(false);
    }
  }

  async function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (attachments.length + files.length > 8) {
      setToast('You can attach up to 8 files per message.');
      return;
    }
    const allowedTextExtensions = new Set([
      'lua', 'luau', 'txt', 'md', 'json', 'csv', 'xml', 'yaml', 'yml',
      'toml', 'js', 'jsx', 'ts', 'tsx', 'css', 'html',
    ]);
    const next: PendingAttachment[] = [];
    let nextBytes = attachments.reduce((sum, item) => sum + item.size, 0);
    for (const file of files) {
      const mimeType = inferMimeType(file);
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isImage = /^image\/(png|jpeg|webp|gif)$/i.test(mimeType);
      const isDocument = ext === 'pdf' || ext === 'docx';
      const isText = allowedTextExtensions.has(ext) && (/^text\/|application\/json/i.test(mimeType) || mimeType === 'application/octet-stream');
      if (!isImage && !isText && !isDocument) {
        setToast('Unsupported file: ' + file.name + '. Add an image, PDF, DOCX or text/code file.');
        continue;
      }
      const maxBytes = isImage ? 8 * 1024 * 1024 : isDocument ? 5 * 1024 * 1024 : 512 * 1024;
      if (file.size > maxBytes) {
        setToast(file.name + (isDocument ? ' is too large. PDF/DOCX limit: 5 MB.' : isImage ? ' is too large. Images: 8 MB max.' : ' is too large. Text files: 512 KB max.'));
        continue;
      }
      if (nextBytes + file.size > 20 * 1024 * 1024) {
        setToast('Attachments for one message must total 20 MB or less.');
        break;
      }
      try {
        if (isImage) {
          const dataUrl = await readDataUrl(file);
          next.push({
            id: crypto.randomUUID(), name: file.name, mimeType, kind: 'image', size: file.size,
            data: dataUrl.split(',')[1] || '', previewUrl: dataUrl,
          });
        } else if (isDocument) {
          next.push({
            id: crypto.randomUUID(),
            name: file.name,
            mimeType: ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            kind: 'file',
            size: file.size,
            data: encodeBytesBase64(await file.arrayBuffer()),
          });
        } else {
          next.push({
            id: crypto.randomUUID(), name: file.name,
            mimeType: mimeType === 'application/octet-stream' ? 'text/plain' : mimeType,
            kind: 'file', size: file.size, data: encodeTextBase64(await file.text()),
          });
        }
        nextBytes += file.size;
      } catch (error) {
        setToast(error instanceof Error ? error.message : 'Could not attach ' + file.name + '.');
      }
    }
    if (next.length) {
      setAttachments(current => [...current, ...next]);
      setToast(next.length + (next.length === 1 ? ' attachment added.' : ' attachments added.'));
    }
  }

  async function sendMessage(content = input, selectedProfile?: CloudProfile, attachmentOverride?: PendingAttachment[], fromQueue = false) {
    const trimmed = content.trim();
    const pending = attachmentOverride ? [...attachmentOverride] : [...attachments];
    if (!trimmed && pending.length === 0) return;
    if (!cloudState?.configured || !cloudState.serviceReady) {
      setSettingsSection('account');
      setSettingsOpen(true);
      setToast(cloudState?.message || 'Rmango Cloud has not been configured by the administrator yet.');
      return;
    }
    if (!cloudState.signedIn) {
      setSettingsSection('account');
      setSettingsOpen(true);
      setToast('Sign in to your Rmango account to use cloud AI.');
      return;
    }

    if (busy && !fromQueue) {
      if (followupQueueRef.current.length >= 6) {
        setToast('The follow-up queue is full. Remove one queued message before adding another.');
        return;
      }
      const queued: PendingFollowup = {
        id: crypto.randomUUID(),
        content: trimmed || 'Please inspect the attached files and images.',
        profile: selectedProfile || cloudProfile,
        attachments: pending,
        queuedAt: timeNow(),
      };
      const nextQueue = [...followupQueueRef.current, queued];
      followupQueueRef.current = nextQueue;
      setFollowupQueue(nextQueue);
      setInput('');
      setAttachments([]);
      setToast('Follow-up queued. Rmango will read it and continue in this same chat after the current response.');
      return;
    }

    if (busy && fromQueue) return;
    const requestId = crypto.randomUUID();
    activeRequestIdRef.current = requestId;
    cancelledRequestIdRef.current = null;
    completedRequestsRef.current.delete(requestId);
    pendingDeltasRef.current.delete(requestId);
    const shownAttachments: ChatAttachment[] = pending.map(({ id, name, mimeType, kind, size, previewUrl }) => ({
      id, name, mimeType, kind, size, previewUrl,
    }));
    const userContent = trimmed || 'Please inspect the attached files and images.';
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userContent,
      createdAt: timeNow(),
      attachments: shownAttachments,
    };
    const assistantPlaceholder: ChatMessage = {
      id: requestId,
      role: 'assistant',
      content: '',
      createdAt: timeNow(),
      modelProfile: selectedProfile || cloudProfile,
    };
    const nextMessages = [...messages, userMessage].slice(-99);
    setMessages([...nextMessages, assistantPlaceholder]);
    if (!fromQueue) {
      setInput('');
      setAttachments([]);
    }
    setBusy(true);

    try {
      const result = await window.rmango.sendMessage({
        messages: nextMessages.map(({ role, content: text }) => ({ role, content: text })),
        attachments: pending.map(({ name, mimeType, kind, size, data }) => ({ name, mimeType, kind, size, data })),
        profile: selectedProfile || cloudProfile,
        conversationId,
        projectId: cloudProjectId,
        requestId,
      });
      completedRequestsRef.current.add(requestId);
      pendingDeltasRef.current.delete(requestId);
      if (result.conversationId) {
        setConversationId(result.conversationId);
        setCloudState(current => current ? { ...current, currentConversationId: result.conversationId } : current);
        void window.rmango.setCurrentConversationId(result.conversationId).catch(() => undefined);
        void window.rmango.getCloudConversations(cloudProjectId)
          .then(setCloudConversations)
          .catch(() => undefined);
        void window.rmango.getCloudTasks(cloudProjectId)
          .then(setCloudTasks)
          .catch(() => undefined);
      }
      if (result.activity?.length) setActivities(current => [...current.filter(item => item.requestId !== requestId), ...result.activity.map(item => ({ ...item, requestId }))].slice(-80));
      setMessages(current => current.map(message =>
        message.id === requestId ? { ...message, content: result.content, modelProfile: result.profile } : message
      ));
    } catch (error) {
      completedRequestsRef.current.add(requestId);
      const trailingDelta = pendingDeltasRef.current.get(requestId) || '';
      pendingDeltasRef.current.delete(requestId);
      const wasCancelled = cancelledRequestIdRef.current === requestId;
      const failureMessage = error instanceof Error ? error.message : 'The Rmango cloud request failed.';
      setActivities(current => [...current, {
        id: 'request-result',
        requestId,
        name: wasCancelled ? 'Generation stopped' : 'Request failed',
        detail: wasCancelled ? 'Stopped by the user.' : failureMessage,
        ok: false,
        status: wasCancelled ? 'cancelled' as const : 'failed' as const,
      }].slice(-80));
      if (wasCancelled) {
        setMessages(current => current.map(item => {
          if (item.id !== requestId) return item;
          const partial = item.content + trailingDelta;
          return { ...item, content: partial || 'Response stopped.' };
        }));
      } else {
        const message = error instanceof Error ? error.message : 'The Rmango cloud request failed.';
        setMessages(current => current.map(item => {
          if (item.id !== requestId) return item;
          const partial = item.content + trailingDelta;
          return { ...item, content: partial ? partial + '\n\n' + message : 'I could not complete that request.\n\n' + message };
        }));
      }
      if (pending.length) setAttachments(current => [...pending, ...current].slice(0, 8));
    } finally {
      if (activeRequestIdRef.current === requestId) activeRequestIdRef.current = null;
      if (cancelledRequestIdRef.current === requestId) cancelledRequestIdRef.current = null;
      setBusy(false);
      void window.rmango.getCloudUsage().then(setCloudUsage).catch(() => undefined);
      composerRef.current?.focus();
    }
  }

  useEffect(() => {
    if (busy || !cloudState?.configured || !cloudState.serviceReady || !cloudState.signedIn || followupQueue.length === 0) return;
    const next = followupQueueRef.current[0];
    if (!next) return;
    const remaining = followupQueueRef.current.slice(1);
    followupQueueRef.current = remaining;
    setFollowupQueue(remaining);
    void sendMessage(next.content, next.profile, next.attachments, true);
  }, [busy, cloudState?.configured, cloudState?.serviceReady, cloudState?.signedIn, followupQueue.length]);

  function removeFollowup(id: string) {
    const remaining = followupQueueRef.current.filter(item => item.id !== id);
    followupQueueRef.current = remaining;
    setFollowupQueue(remaining);
  }

  async function handleCancelMessage() {
    const requestId = activeRequestIdRef.current;
    if (!requestId) return;
    cancelledRequestIdRef.current = requestId;
    try {
      const result = await window.rmango.cancelMessage(requestId);
      setToast(result.ok ? 'Stopping the response…' : 'The response has already finished.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not stop the current response.');
    }
  }

  async function respondToApproval(approved: boolean) {
    if (!pendingApproval || approvalBusy) return;
    setApprovalBusy(true);
    try {
      const response = await window.rmango.respondToolApproval(pendingApproval.requestId, approved);
      setPendingApproval(null);
      if (!response.ok) {
        setToast('That approval request expired. Ask Rmango to retry the action.');
        return;
      }
      setToast(approved ? 'Approved. Rmango is sending the action to Roblox Studio.' : 'Action denied. Nothing was changed by that request.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not submit the approval response.');
      setApprovalBusy(false);
    }
  }

  async function copyTextToClipboard(value: string) {
    try {
      await writeClipboardText(value);
      setToast('Copied to clipboard.');
    } catch {
      setToast('Could not access the clipboard in this window.');
    }
  }

  function handleComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && (sendOnEnter || event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) void addFiles(event.target.files);
    event.target.value = '';
  }

  function openFilePicker(imagesOnly = false) {
    if (!fileInputRef.current) return;
    fileInputRef.current.accept = imagesOnly
      ? 'image/png,image/jpeg,image/webp,image/gif'
      : 'image/png,image/jpeg,image/webp,image/gif,.pdf,.docx,.lua,.luau,.txt,.md,.json,.csv,.xml,.yaml,.yml,.toml,.js,.jsx,.ts,.tsx,.css,.html';
    fileInputRef.current.click();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (event.dataTransfer.files?.length) void addFiles(event.dataTransfer.files);
  }

  const filteredFiles = useMemo(() => {
    if (!search.trim()) return projectFiles;
    const query = search.toLowerCase();
    return projectFiles.filter(file => file.name.toLowerCase().includes(query));
  }, [projectFiles, search]);

  const studioConnected = appState?.studioConnected ?? false;
  const cloudReady = Boolean(cloudState?.configured && cloudState.serviceReady);
  const currentProfile = cloudModels?.profiles.find(item => item.profile === cloudProfile);
  const cloudStatusLabel = cloudLoading
    ? 'CHECKING CLOUD'
    : !cloudState?.configured
      ? 'CLOUD NOT CONFIGURED'
      : !cloudState.serviceReady
        ? cloudState.message?.includes('SUPABASE_SECRET_KEY') || cloudState.message?.includes('SUPABASE_SERVICE_ROLE_KEY')
          ? 'SERVER KEY MISSING'
          : /spend|budget|inference.*disabled/i.test(cloudState.message || '')
            ? 'AI BUDGET NOT ENABLED'
            : 'CLOUD SETUP REQUIRED'
        : cloudState.signedIn
          ? 'CLOUD AI READY'
          : 'SIGN IN REQUIRED';

  const quickPrompts = [
    {
      icon: <Search size={15}/>, label: 'Inspect my game', detail: 'Map the place structure and current systems',
      prompt: 'Inspect my currently open Roblox game. Identify the experience and place, map the DataModel hierarchy, find important scripts and report the state of the game. Do not make changes yet.',
    },
    {
      icon: <Code2 size={15}/>, label: 'Review my scripts', detail: 'Find bugs and architecture issues',
      prompt: 'Review the scripts in my open Roblox Studio project. Search the important systems, inspect their dependencies, and report bugs and high-impact improvements. Do not edit yet.',
    },
    {
      icon: <Layers3 size={15}/>, label: 'Plan a map', detail: 'Design a detailed Roblox map in stages',
      prompt: 'Help me design a high-quality Roblox map. First inspect the current place and its scale. Then propose a detailed map layout with landmarks, routes, gameplay areas, spawn points, materials, lighting and decoration. Ask me to approve the plan before creating anything.',
    },
  ];

  return (
    <div
      className="app-shell"
      data-theme={theme}
      data-density={density}
      data-motion={animationsEnabled && !reducedMotion ? 'full' : 'reduced'}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      data-font-size={fontSize}
      onDragOver={event => { event.preventDefault(); setDragActive(true); }}
      onDragLeave={event => { if (event.currentTarget === event.target) setDragActive(false); }}
      onDrop={handleDrop}
    >
      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand-tile"><MangoMark size={32}/></div>
          <span className="brand-name">rmango</span>
          <span className="brand-version">STUDIO AI</span>
        </div>
        <div className="topbar-divider"/>
        <button type="button" className="workspace-crumb" title={appState?.projectPath || "Open a Roblox project folder"} onClick={() => void handleOpenProject()}><FolderOpen size={15}/><span>{appState?.projectPath ? appState.projectPath.split(String.fromCharCode(92)).pop()?.split('/').pop() : "Open project"}</span><ChevronDown size={13}/></button>
        <div className="topbar-spacer"/>
        <button className={'runtime-pill ' + (cloudReady ? 'ready' : '')} onClick={() => { setSettingsSection('usage'); setSettingsOpen(true); }}>
          <span className="runtime-dot"/>{cloudStatusLabel}
        </button>
        {cloudState?.signedIn
          ? <button className="top-settings" onClick={() => { setSettingsSection('account'); setSettingsOpen(true); }} title="Cloud account">{cloudState.email || 'Account'}</button>
          : <button className="top-settings" onClick={() => { setSettingsSection('account'); setSettingsOpen(true); }}>Sign in</button>}
        <div className={'connection-pill ' + (studioReady ? 'connected' : '')}>
          <span className="status-dot"/>{studioReady ? 'Studio ready' : studioConnected ? 'MCP bridge online' : 'Studio offline'}
        </div>
        <button className="icon-button top-icon" title="Roblox MCP help" onClick={() => void window.rmango.openExternal('https://create.roblox.com/docs/studio/mcp')}><CircleHelp size={17}/></button>
        <button
          className="top-update-button"
          onClick={() => updateState?.status === 'downloaded' ? void handleInstallUpdate() : void handleCheckUpdates()}
          title="Check GitHub Releases for a newer Rmango version"
          disabled={updateState?.status === 'checking' || updateState?.status === 'downloading'}
        >
          {updateState?.status === 'checking' || updateState?.status === 'downloading'
            ? <LoaderCircle size={13} className="spin"/>
            : updateState?.status === 'downloaded' ? <Download size={13}/> : <RefreshCw size={13}/>}
          {updateState?.status === 'downloaded' ? 'Install update' : 'Check updates'}
        </button>
        <button className="top-settings" onClick={() => { setSettingsSection('general'); setSettingsOpen(true); }}><Settings2 size={15}/> Settings</button>
        <div className="avatar"><MangoMark size={25}/></div>
      </header>

      {updateState && ['checking', 'downloading', 'downloaded', 'error'].includes(updateState.status) && (
        <div className={'update-banner ' + updateState.status}>
          <div className="update-banner-icon">
            {updateState.status === 'error' ? <AlertCircle size={16}/> : updateState.status === 'downloaded' ? <CheckCircle2 size={16}/> : <Download size={16}/>}
          </div>
          <div className="update-banner-copy">
            <strong>
              {updateState.status === 'checking' && 'Checking for Rmango updates'}
              {updateState.status === 'downloading' && 'A new Rmango version is downloading'}
              {updateState.status === 'downloaded' && 'Update ready to install'}
              {updateState.status === 'error' && 'Could not update Rmango'}
            </strong>
            <span>
              {updateState.status === 'checking' && 'Looking for a newer version on GitHub Releases…'}
              {updateState.status === 'downloading' && (updateState.message || 'Downloading update in the background…')}
              {updateState.status === 'downloaded' && ('Version ' + (updateState.availableVersion || '') + ' is ready. Restart when you are ready.')}
              {updateState.status === 'error' && (updateState.error || updateState.message || 'Check your internet connection and try again.')}
            </span>
            {updateState.status === 'downloading' && (
              <div className="update-progress-track"><div className="update-progress-fill" style={{ width: Math.max(0, Math.min(100, updateState.progress || 0)) + '%' }}/></div>
            )}
          </div>
          {updateState.status === 'downloaded' && <button className="update-install-button" onClick={() => void handleInstallUpdate()}>Restart &amp; install <ArrowRight size={13}/></button>}
          {updateState.status === 'error' && <button className="update-retry-button" onClick={() => void handleCheckUpdates()}>Retry</button>}
        </div>
      )}

      <div className="workspace-layout">
        <nav className="activity-rail">
          <button className="rail-button active" title="Workspace" aria-label="Workspace" onClick={() => { setLeftSidebarCollapsed(false); setLeftSidebarOpen(true); setRightPanelOpen(false); }}><Bot size={18}/></button>
          <button className={"rail-button " + (!leftSidebarCollapsed ? "active" : "")} title="Toggle project sidebar (Ctrl+B)" aria-label="Toggle project sidebar" onClick={() => { setLeftSidebarCollapsed(value => !value); setLeftSidebarOpen(true); }}><Folder size={18}/></button>
          <button className="rail-button" title="Cloud projects" aria-label="Cloud projects" onClick={() => { setLeftSidebarOpen(true); setCloudProjectSearch(''); }}><Layers3 size={18}/></button>
          <button className="rail-button" title="AI chat" aria-label="Focus chat composer" onClick={() => composerRef.current?.focus()}><MessageSquare size={18}/></button>
          <button className="rail-button" title="Session inspector" aria-label="Session inspector" onClick={() => setRightPanelOpen(true)}><Wrench size={18}/></button>
          <div className="rail-spacer"/>
          <button className="rail-button" title="Settings" onClick={() => { setSettingsSection('general'); setSettingsOpen(true); }}><Settings2 size={18}/></button>
        </nav>

        <aside className={"left-sidebar " + (leftSidebarOpen ? "visible" : "") + (leftSidebarCollapsed ? " collapsed" : "")}>
          <div className="sidebar-heading"><span>PROJECTS</span><button type="button" className="subtle-icon sidebar-collapse-button" title="Collapse project sidebar (Ctrl+B)" aria-label="Collapse project sidebar" onClick={() => setLeftSidebarCollapsed(true)}><PanelRight size={15}/></button></div>
          <div className="project-card">
            <div className="project-icon"><Gamepad2 size={17}/></div>
            <div className="project-details">
              <strong>{appState?.projectPath ? appState.projectPath.split(/[\\/]/).filter(Boolean).pop() : 'No project open'}</strong>
              <span>{appState?.projectPath ? 'Local project folder' : 'Choose a folder to begin'}</span>
            </div>
            <button className="subtle-icon" title="Open project folder" onClick={() => void handleOpenProject()}><FolderOpen size={15}/></button>
          </div>
          <div className="section-row"><span>PROJECT EXPLORER</span><button className="subtle-icon" onClick={() => void handleOpenProject()} title="Open folder"><Plus size={14}/></button></div>
          {appState?.projectPath
            ? <div className="project-path" title={appState.projectPath}>{appState.projectPath}</div>
            : <div className="empty-explorer"><FolderOpen size={22}/><span>No project folder selected</span><button onClick={() => void handleOpenProject()}>Open folder</button></div>}
          {appState?.projectPath && <div className="project-cloud-upload">
            <button onClick={() => void handleUploadProject()} disabled={uploadingProject || !cloudReady || !cloudState?.signedIn}>
              {uploadingProject ? <LoaderCircle size={13} className="spin"/> : <Upload size={13}/>}
              {uploadingProject ? 'Uploading project…' : cloudProjectId ? 'Sync project to Cloud' : 'Upload project to Cloud'}
            </button>
            {projectUploadProgress && <div className="project-upload-progress">
              <div><span>{projectUploadProgress.currentFile}</span><strong>{projectUploadProgress.completed}/{projectUploadProgress.total}</strong></div>
              <div className="update-progress-track"><div className="update-progress-fill" style={{ width: (projectUploadProgress.total ? projectUploadProgress.completed / projectUploadProgress.total * 100 : 0) + '%' }}/></div>
            </div>}
            {cloudProjectId && <>
              <small>Linked cloud project · {cloudProjectId.slice(0, 8)}</small>
              <div className="cloud-project-actions">
                <button type="button" onClick={() => void handleLoadProjectChanges()}><Code2 size={12}/> Review changes ({cloudProjectChanges.filter(item => item.status === 'pending').length})</button>
                <button type="button" onClick={() => void handleDownloadCloudProject()}><Download size={12}/> Download ZIP</button>
              </div>
            </>}
            {!cloudReady && <small>Sign in and connect Rmango Cloud to upload</small>}
          </div>}
          <section className="cloud-projects-panel">
            <div className="cloud-projects-heading">
              <span>CLOUD PROJECTS</span>
              <button type="button" title="Create cloud project" disabled={!cloudState?.signedIn || !cloudReady} onClick={() => setProjectDialog({ mode: 'create', name: '', description: '' })}><Plus size={13}/></button>
            </div>
            {cloudProjects.length > 4 && <div className="cloud-project-search"><Search size={12}/><input value={cloudProjectSearch} onChange={event => setCloudProjectSearch(event.target.value)} placeholder="Search cloud projects"/></div>}
            {!cloudState?.signedIn
              ? <div className="cloud-project-empty">Sign in to manage cloud projects.</div>
              : filteredCloudProjects.length === 0
                ? <div className="cloud-project-empty">{cloudProjects.length ? 'No projects match your search.' : 'Create a cloud project to store scripts, decisions and project memory.'}</div>
                : <div className="cloud-project-list">
                  {filteredCloudProjects.slice(0, 20).map(project =>
                    <div className={'cloud-project-row ' + (cloudProjectId === project.id ? 'selected' : '')} key={project.id}>
                      <button type="button" className="cloud-project-select" disabled={busy} onClick={() => void handleSelectCloudProject(project)} title={project.description || project.name}>
                        <span className="cloud-project-mark"><Gamepad2 size={13}/></span>
                        <span className="cloud-project-copy"><strong>{project.name}</strong><small>{project.description || 'Roblox development project'}</small></span>
                        {cloudProjectId === project.id && <span className="cloud-project-active-dot"/>}
                      </button>
                      <div className="cloud-project-actions-mini">
                        <button type="button" title="Rename project" aria-label={'Rename ' + project.name} disabled={busy} onClick={() => openRenameProject(project)}><Pencil size={11}/></button>
                        <button type="button" title="Delete project" aria-label={'Delete ' + project.name} disabled={busy} onClick={() => void handleDeleteCloudProject(project)}><Trash2 size={11}/></button>
                      </div>
                    </div>
                  )}
                </div>}
          </section>
          {projectFiles.length > 0 && <>
            <div className="file-search"><Search size={13}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Filter files"/></div>
            <div className="file-tree">
              {filteredFiles.slice(0, 80).map((file, index) =>
                <div className={'file-row ' + (file.kind === 'folder' ? 'folder-row' : '')} key={file.path + '-' + index}>
                  <FileGlyph file={file}/><span>{file.name}</span>
                </div>
              )}
              {filteredFiles.length === 0 && <div className="small-empty">No matching files</div>}
            </div>
          </>}
          <div className="conversation-section">
            <div className="conversation-section-heading">
              <span>RECENT CHATS</span>
              <button type="button" title="New conversation" onClick={() => void handleNewConversation()} disabled={!cloudState?.signedIn || !cloudReady || busy}><Plus size={13}/></button>
            </div>
            {!cloudState?.signedIn
              ? <div className="conversation-empty">Sign in to sync chat history.</div>
              : cloudConversations.length === 0
                ? <div className="conversation-empty">Your cloud conversations will appear here.</div>
                : <div className="conversation-list">
                  {cloudConversations.slice(0, 20).map(item =>
                    <button
                      type="button"
                      className={'conversation-item ' + (item.id === conversationId ? 'active' : '')}
                      key={item.id}
                      disabled={Boolean(loadingConversationId) || busy}
                      onClick={() => void handleSelectConversation(item.id)}
                      title={item.title}
                    >
                      <MessageSquare size={12}/>
                      <span>{item.title || 'New chat'}</span>
                      {loadingConversationId === item.id ? <LoaderCircle size={11} className="spin"/> : null}
                    </button>
                  )}
                </div>}
          </div>
          <div className="sidebar-bottom">
            <div className="section-row"><span>CONNECTIONS</span><span className={'tiny-status ' + (studioConnected ? 'on' : '')}/></div>
            <div className="integration-row studio-integration-row">
              <div className="integration-icon roblox"><Gamepad2 size={14}/></div>
              <div className="studio-integration-copy">
                <strong>Roblox Studio</strong>
                <span>{studioReady
                  ? (studioInstances.find(item => item.id === selectedStudioId)?.name || 'Studio place ready') + ' · ' + studioTools.length + ' tools'
                  : studioConnected ? 'MCP bridge online · no open place' : 'Not connected'}</span>
              </div>
              {studioConnected && studioInstances.length > 1 && <select
                className="studio-instance-select"
                aria-label="Select Roblox Studio instance"
                value={selectedStudioId || ''}
                onChange={event => void handleSelectStudioInstance(event.target.value)}
                title="Choose which open Studio instance RMango controls"
              >
                {studioInstances.map(instance => <option value={instance.id} key={instance.id}>{instance.name}{instance.placeId ? ' · ' + instance.placeId : ''}</option>)}
              </select>}
              <button className="subtle-icon" title={studioConnected ? (studioReady ? 'Disconnect Studio' : 'Refresh Studio sessions') : 'Connect to Studio MCP'} onClick={() => studioConnected && studioReady ? void handleDisconnect() : void handleConnect()} disabled={connecting}>
                {connecting ? <LoaderCircle size={13} className="spin"/> : studioConnected && studioReady ? <Check size={14}/> : studioConnected ? <RefreshCw size={13}/> : <Link2 size={14}/>}
              </button>
            </div>
            <div className="integration-row">
              <div className="integration-icon local"><Sparkles size={14}/></div>
              <div><strong>Rmango Cloud AI</strong><span>{cloudState?.signedIn ? (cloudReady ? 'Connected · ' + (currentProfile?.profileLabel || 'Profile ready') : 'Account connected') : cloudState?.configured ? 'Sign in required' : 'Backend not configured'}</span></div>
              <button className="subtle-icon" title="Cloud model settings" onClick={() => { setSettingsSection('ai'); setSettingsOpen(true); }}><Settings2 size={13}/></button>
            </div>
          </div>
        </aside>

        <main className="main-panel">
          <div className="main-toolbar">
            <div className="main-toolbar-leading"><div className="tab-active"><MessageSquare size={14}/> Chat <span className="tab-live">RMANGO AI</span></div>{appState?.projectPath && <span className="toolbar-context"><Folder size={12}/>{appState.projectPath.split(/[\\/]/).filter(Boolean).pop()}</span>}</div>
            <div className="toolbar-actions">
              <button type="button" className="new-chat-button" onClick={() => void handleNewConversation()} disabled={!cloudState?.signedIn || !cloudReady || busy} title="Start a new conversation"><Plus size={13}/> New chat</button>
              <span className="model-chip"><Sparkles size={12}/>{currentProfile?.profileLabel || 'Cloud model'}</span>
              <button className="subtle-icon" title="Toggle inspector" onClick={() => setRightPanelOpen(value => !value)}><Menu size={16}/></button>
            </div>
          </div>

          <div className="chat-scroll">
            <div className="chat-content">
              {messages.length === 0 ? (
                <div className="welcome-block">
                  <div className="welcome-orb"><div className="welcome-logo"><MangoMark size={66}/></div><span className="orb-spark spark-one"/><span className="orb-spark spark-two"/><span className="orb-spark spark-three"/></div>
                  <div className="welcome-eyebrow"><span className="eyebrow-line"/> YOUR ROBLOX DEVELOPMENT WORKSPACE <span className="eyebrow-line"/></div>
                  <h1>What are we<br/><em>building today?</em></h1>
                  <p>Describe what you want to create or fix. RMango can inspect your project, work with Roblox Studio, and help turn ideas into working game systems.</p>

                  {!cloudReady && <div className="setup-card">
                    <div className="setup-card-icon"><Sparkles size={19}/></div>
                    <div className="setup-card-copy">
                      <strong>{cloudState?.configured ? 'Connect your Rmango account' : 'Rmango Cloud setup required'}</strong>
                      <span>{cloudState?.message || 'Cloud model inference is remote. No local AI runtime or model downloads are needed.'}</span>
                    </div>
                    <button onClick={() => { setSettingsSection('account'); setSettingsOpen(true); }}>{cloudState?.configured ? 'Sign in' : 'Details'} <ArrowRight size={13}/></button>
                  </div>}

                  <div className="quick-grid">
                    {quickPrompts.map(item =>
                      <button className="quick-card" key={item.label} onClick={() => void sendMessage(item.prompt, item.label === 'Plan a map' ? 'agent' : 'developer')}>
                        <span className="quick-icon">{item.icon}</span>
                        <span className="quick-copy"><strong>{item.label}</strong><small>{item.detail}</small></span>
                        <ArrowRight size={14} className="quick-arrow"/>
                      </button>
                    )}
                  </div>
                  <div className="welcome-footnote"><ShieldCheck size={13}/> Studio changes always wait for your approval.</div>
                </div>
              ) : (
                <div className="message-list">
                  {messages.map((message, index) =>
                    <div className={'message-row ' + message.role} key={message.createdAt + '-' + index}>
                      <div className={'message-avatar ' + message.role}>
                        {message.role === 'assistant' ? <MangoMark size={24}/> : <span>YOU</span>}
                      </div>
                      <div className="message-body">
                        <div className="message-meta">
                          <strong>{message.role === 'assistant' ? 'Rmango' : 'You'}</strong>
                          <span>{displayTime(message.createdAt)}</span>
                          {message.role === 'assistant' && <span className="agent-tag"><Sparkles size={10}/> {(message.modelProfile || 'cloud').toUpperCase()}</span>}
                          {message.role === 'assistant' && Boolean(message.content) && <button type="button" className="message-copy-button" title="Copy response" aria-label="Copy response" onClick={() => void copyTextToClipboard(message.content)}><Copy size={12}/></button>}
                        </div>
                        {message.attachments?.length ? <div className="message-attachments">
                          {message.attachments.map(attachment =>
                            <div className="message-attachment" key={attachment.id}>
                              {attachment.kind === 'image' && attachment.previewUrl
                                ? <img src={attachment.previewUrl} alt={attachment.name}/>
                                : <span className="attachment-icon">{attachment.kind === 'image' ? <ImageIcon size={17}/> : <FileText size={17}/>}</span>}
                              <span>{attachment.name}</span>
                            </div>
                          )}
                        </div> : null}
                        <div className="message-content"><MessageContent content={message.content}/></div>
                      </div>
                    </div>
                  )}
                  {busy && <div className="message-row assistant">
                    <div className="message-avatar assistant"><MangoMark size={24}/></div>
                    <div className="message-body">
                      <div className="message-meta"><strong>Rmango</strong><span>working</span></div>
                      <div className="thinking-state"><span className="typing-dots"><i/><i/><i/></span><span>Thinking and checking the available tools…</span></div>
                    </div>
                  </div>}
                  <div ref={bottomRef}/>
                </div>
              )}
            </div>
          </div>

          <div className={'composer-area ' + (dragActive ? 'drag-active' : '')} onDragOver={event => { event.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={handleDrop}>
            {dragActive && <div className="drop-overlay"><Upload size={22}/> Drop photos or files to attach</div>}
            {attachments.length > 0 && <div className="attachment-tray">
              {attachments.map(attachment =>
                <div className="attachment-chip" key={attachment.id}>
                  {attachment.kind === 'image' && attachment.previewUrl
                    ? <img src={attachment.previewUrl} alt={attachment.name}/>
                    : <span className="attachment-file-icon">{attachment.kind === 'image' ? <ImageIcon size={15}/> : <FileText size={15}/>}</span>}
                  <span className="attachment-chip-name">{attachment.name}</span>
                  <button title="Remove attachment" onClick={() => setAttachments(current => current.filter(item => item.id !== attachment.id))}><X size={13}/></button>
                </div>
              )}
            </div>}
            {busy && <div className="composer-live-status"><span className="composer-live-dot"/><span>Rmango is working. You can send another instruction or attach files; they will be sent after this response in the same chat.</span></div>}
            {followupQueue.length > 0 && <div className="followup-queue">
              <div className="followup-queue-heading"><strong>FOLLOW-UP QUEUE</strong><span>{followupQueue.length}/6</span></div>
              {followupQueue.map(item => <div className="followup-queue-item" key={item.id}>
                <span className="followup-queue-text">{item.content}</span>
                <span className="followup-queue-files">{item.attachments.length ? item.attachments.length + ' file(s)' : 'Text'}</span>
                <button type="button" onClick={() => removeFollowup(item.id)} title="Remove queued follow-up" aria-label="Remove queued follow-up"><X size={12}/></button>
              </div>)}
            </div>}
            <div className="composer-box">
              <textarea
                ref={composerRef}
                rows={2}
                value={input}
                onChange={event => setInput(event.target.value)}
                onKeyDown={handleComposerKey}
                placeholder={busy ? 'Add a follow-up while Rmango works…' : 'Ask Rmango to inspect, design, code, or improve your Roblox game…'}
              />
              <div className="composer-footer">
                <div className="composer-left">
                  <select className="profile-select" value={cloudProfile} onChange={event => setCloudProfile(event.target.value as CloudProfile)} title="Cloud AI profile" disabled={!cloudState?.signedIn || busy}>
                    <option value="fast">Rmango Fast</option>
                    <option value="developer">Rmango Developer</option>
                    <option value="think">Rmango Think</option>
                    <option value="vision">Rmango Vision</option>
                    <option value="agent">Rmango Agent</option>
                  </select>
                  <button className="attach-button" title="Attach images or files" onClick={() => openFilePicker(false)}><Paperclip size={14}/> Attach</button>
                  <button className="attach-button attach-image" title="Attach photo" onClick={() => openFilePicker(true)}><ImageIcon size={14}/> Photo</button>
                  <input ref={fileInputRef} className="hidden-file-input" type="file" multiple onChange={handleFileChange}/>
                  <span className="composer-hint">Enter to send · Shift + Enter for new line</span>
                </div>
                {busy && <button type="button" className="composer-stop-button composer-stop-inline" onClick={() => void handleCancelMessage()} title="Stop current response" aria-label="Stop current response"><Square size={12} fill="currentColor"/></button>}
                <button
                  className="send-button"
                  title={busy ? 'Queue follow-up' : 'Send message'}
                  aria-label={busy ? 'Queue follow-up' : 'Send message'}
                  disabled={!input.trim() && attachments.length === 0}
                  onClick={() => void sendMessage()}
                >
                  <Send size={15}/>
                </button>
              </div>
            </div>
            <div className="composer-disclaimer"><ShieldCheck size={11}/> Photos and text/code files are processed by your selected model. Studio edits require approval.</div>
          </div>
        </main>

        {rightPanelOpen && <aside className="right-sidebar">
          <div className="right-heading"><span>SESSION INSPECTOR</span><button className="subtle-icon" onClick={() => setRightPanelOpen(false)} title="Close workspace panel"><X size={15}/></button></div>
          <div className="workspace-map-shell">
            <div className="workspace-map-caption"><span>LIVE WORKSPACE STATUS</span><span className="map-caption-status"><i className={cloudReady && studioReady ? 'all-live' : ''}/>{cloudReady && studioReady ? 'ALL SYSTEMS READY' : cloudReady && studioConnected ? 'AI ONLINE · OPEN A PLACE' : cloudReady ? 'AI ONLINE · STUDIO OFFLINE' : studioReady ? 'STUDIO READY · AI OFFLINE' : studioConnected ? 'MCP BRIDGE ONLY' : 'WAITING FOR SERVICES'}</span></div>
            <div className="workspace-map">
              <button type="button" className="map-node project-node" onClick={() => void handleOpenProject()}>
                <span className="map-node-icon"><FolderOpen size={18}/></span>
                <span className="map-node-copy"><small>PROJECT</small><strong>{appState?.projectPath ? appState.projectPath.split(String.fromCharCode(92)).pop()?.split('/').pop() : 'No project open'}</strong><em>{projectFiles.length} indexed files · click to open</em></span>
              </button>
              <span className={'map-wire ' + (cloudReady ? 'live' : '')}/>
              <button type="button" className="map-node ai-node" onClick={() => { setSettingsSection('ai'); setSettingsOpen(true); }}>
                <span className="map-node-icon"><Sparkles size={18}/></span>
                <span className="map-node-copy"><small>RMANGO AI</small><strong>{cloudReady ? 'Cloud engine' : 'AI service'}</strong><em>{cloudReady ? (currentProfile?.profileLabel || 'Ready for prompts') : (cloudState?.message || 'Cloud setup required')}</em></span>
              </button>
              <span className={'map-wire ' + (studioReady ? 'live' : '')}/>
              <button type="button" className={'map-node studio-node ' + (studioReady ? 'connected' : '')} onClick={() => studioConnected ? (studioReady ? void handleDisconnect() : void handleConnect()) : void handleConnect()}>
                <span className="map-node-icon"><Gamepad2 size={18}/></span>
                <span className="map-node-copy"><small>ROBLOX STUDIO</small><strong>{studioReady ? 'Place ready' : studioConnected ? 'Bridge online' : 'Waiting for Studio'}</strong><em>{studioReady ? (studioInstances.find(item => item.id === selectedStudioId)?.name || 'Studio selected') : studioConnected ? 'Open a place, then refresh' : 'Click to connect MCP'}</em></span>
              </button>
            </div>
            <div className="workspace-map-foot"><span><i className="map-dot project-dot"/> Project context</span><span><i className="map-dot ai-dot"/> Remote reasoning</span><span><i className="map-dot studio-dot"/> Studio tools</span></div>
          </div>

          <section className="inspector-section local-section">
            <div className="section-title">
              <span>CLOUD AI ENGINE</span>
              <span className={'live-indicator ' + (cloudReady ? 'live' : '')}>{cloudReady ? 'ONLINE' : cloudLoading ? 'CHECKING' : 'OFFLINE'}</span>
            </div>
            <div className="local-status-card">
              <div className="local-status-icon"><Sparkles size={19}/></div>
              <div className="local-status-copy">
                <strong>{cloudReady ? (cloudState?.signedIn ? 'Hosted AI is ready' : 'Cloud service is ready') : 'Cloud connection required'}</strong>
                <span>{cloudState?.email || cloudState?.apiHost || cloudState?.message || 'No local models or API keys'}</span>
              </div>
              <span className={'status-dot ' + (cloudReady ? 'bright' : '')}/>
              <div className="local-meta"><span>INFERENCE</span><strong>Remote cloud</strong><span>DEVICE</span><strong>Interface only</strong></div>
            </div>
            {cloudState?.signedIn
              ? <button className="primary-action" onClick={() => { setSettingsSection('ai'); setSettingsOpen(true); }}><Settings2 size={13}/> Cloud model manager <ArrowRight size={13}/></button>
              : <button className="primary-action" onClick={() => { setSettingsSection('account'); setSettingsOpen(true); }}><LockKeyhole size={13}/> Sign in to Rmango <ArrowRight size={13}/></button>}
            {cloudReady && <div className="connect-help">
              <strong>{currentProfile?.profileLabel || 'Cloud model profiles'}</strong>
              <span>{currentProfile?.name || 'Choose a model profile below the chat composer.'}</span>
              {currentProfile && <span>
                {currentProfile.contextWindow ? currentProfile.contextWindow.toLocaleString() + ' context tokens' : 'Context details unavailable'}
                {' · '}
                {currentProfile.capabilities.includes('reasoning') ? 'Reasoning' : 'General'}
                {currentProfile.inputModalities.includes('image') ? ' · Vision' : ''}
              </span>}
            </div>}
            {cloudState?.message && <div className="secure-note"><AlertCircle size={13}/><span>{cloudState.message}</span></div>}
          </section>

          <section className="inspector-section">
            <div className="section-title"><span>ROBLOX STUDIO MCP</span><span className={'live-indicator ' + (studioReady ? 'live' : '')}>{studioReady ? 'PLACE READY' : studioConnected ? 'BRIDGE ONLY' : 'OFFLINE'}</span></div>
            <div className="studio-status-card">
              <div className={'studio-status-icon ' + (studioReady ? 'live' : '')}><Gamepad2 size={19}/></div>
              <div className="studio-status-copy">
                <strong>{studioReady
                  ? (studioInstances.find(item => item.id === selectedStudioId)?.name || 'Studio place ready')
                  : studioConnected ? 'MCP bridge is running' : 'Waiting for Studio'}</strong>
                <span>{studioReady
                  ? (studioCloudLinked ? 'Live place selected · secure cloud bridge active' : 'Live place selected · sign in to link cloud AI')
                  : studioConnected ? 'Open a place in Roblox Studio, then refresh the connection' : 'Enable Studio as MCP server in Assistant → Manage MCP Servers'}</span>
              </div>
              <span className={'status-dot ' + (studioReady ? 'bright' : '')}/>
              <div className="studio-meta"><div><span>TOOLS</span><strong>{studioConnected ? studioTools.length : '—'}</strong></div><div><span>PLACE</span><strong>{studioReady ? 'Selected' : 'None'}</strong></div><div><span>ACCESS</span><strong>Approval gated</strong></div></div>
            </div>
            {studioConnected && studioInstances.length > 1 && <label className="studio-instance-picker">
              <span>ACTIVE STUDIO INSTANCE</span>
              <select value={selectedStudioId || ''} onChange={event => void handleSelectStudioInstance(event.target.value)}>
                {studioInstances.map(instance => <option value={instance.id} key={instance.id}>{instance.name}{instance.placeId ? ' · Place ' + instance.placeId : ''}</option>)}
              </select>
            </label>}
            <div className="studio-connection-actions">
              {!studioConnected
                ? <button className="primary-action" onClick={() => void handleConnect()} disabled={connecting}>{connecting ? <LoaderCircle size={14} className="spin"/> : <Link2 size={14}/>} Connect Studio MCP <ArrowRight size={13}/></button>
                : <button className="outline-action" onClick={() => studioReady ? void handleDisconnect() : void handleConnect()} disabled={connecting}>
                    {connecting ? <LoaderCircle size={13} className="spin"/> : studioReady ? <Check size={13}/> : <RefreshCw size={13}/>}
                    {studioReady ? 'Disconnect Studio' : 'Refresh Studio sessions'}
                  </button>}
              {studioConnected && <button className="studio-disconnect-quiet" onClick={() => void handleDisconnect()} disabled={connecting} title="Stop the local MCP bridge">Stop bridge</button>}
            </div>
            {!studioReady && <div className="connect-help">
              <strong>{studioConnected ? 'One more step' : 'Quick setup'}</strong>
              <span>Open a place in Roblox Studio. In Assistant → Manage MCP Servers, enable “Enable Studio as MCP server”. Then refresh Studio sessions here.</span>
              <button onClick={() => void window.rmango.openExternal('https://create.roblox.com/docs/studio/mcp')}>Official setup guide <ExternalLink size={11}/></button>
            </div>}
          </section>

          <section className="inspector-section">
            <div className="section-title"><span>QUICK ACTIONS</span></div>
            <button className="quick-action-row" onClick={() => void handleDiagnostics()} disabled={!studioReady || diagnosing}>
              <span className="action-icon"><Activity size={14}/></span><span><strong>Run Studio diagnostics</strong><small>Check session and place state</small></span>
              {diagnosing ? <LoaderCircle size={14} className="spin"/> : <ArrowRight size={13}/>}
            </button>
            <button className="quick-action-row" onClick={() => void sendMessage('Inspect the open Roblox place. Map the current DataModel, identify existing map and gameplay systems, then suggest the next high-impact improvement. Do not make changes before explaining the plan.')} disabled={!studioReady || busy}>
              <span className="action-icon mango"><Search size={14}/></span><span><strong>Map my current place</strong><small>Inspect structure and layout</small></span><ArrowRight size={13}/>
            </button>
            <button className="quick-action-row" onClick={() => void sendMessage(quickPrompts[2].prompt)} disabled={!studioReady || busy}>
              <span className="action-icon build"><Layers3 size={14}/></span><span><strong>Design a new map</strong><small>Plan it before generating</small></span><ArrowRight size={13}/>
            </button>
          </section>

          {diagnosticResult && <section className="inspector-section diagnostic-section">
            <div className="section-title"><span>DIAGNOSTIC OUTPUT</span><button className="subtle-icon" onClick={() => setDiagnosticResult('')}><X size={13}/></button></div>
            <pre>{diagnosticResult}</pre>
          </section>}
          <section className="inspector-section task-history-section">
            <div className="section-title">
              <span>DEVELOPMENT TASKS</span>
              <button className="subtle-icon" title="Refresh task history" onClick={() => void window.rmango.getCloudTasks(cloudProjectId).then(setCloudTasks).catch(error => setToast(error instanceof Error ? error.message : 'Could not refresh task history.'))}><RefreshCw size={13}/></button>
            </div>
            {cloudTasks.length
              ? cloudTasks.slice(0, 4).map(task =>
                  <div className="task-history-item" key={task.id}>
                    <div className="task-history-top">
                      <span className={'task-status-dot ' + task.status}/>
                      <strong>{task.status.replace('_', ' ')}</strong>
                      <time>{displayTime(task.created_at)}</time>
                    </div>
                    <p>{task.task_text}</p>
                    {task.error && <span className="task-history-error">{task.error}</span>}
                    {task.events.length > 0 && <details className="task-events">
                      <summary>{task.events.length} recorded operations</summary>
                      <div>{task.events.slice(-5).map(event =>
                        <span key={event.id}><i/> {event.message}</span>
                      )}</div>
                    </details>}
                  </div>
                )
              : <div className="activity-empty"><Layers3 size={15}/><span>Coordinated agent tasks will be saved here.</span></div>}
          </section>
          <section className="inspector-section activity-section">
            <div className="section-title"><span>RECENT ACTIVITY</span><button className="subtle-icon" onClick={() => setActivities([])} title="Clear activity"><RefreshCw size={13}/></button></div>
            {activities.length
              ? activities.slice(-7).reverse().map((item, index) =>
                  <div className="activity-item" key={item.name + '-' + index}>
                    <span className={'activity-check ' + (item.status === 'running' ? 'running' : item.ok ? 'ok' : 'bad')}>
                      {item.status === 'running' ? <LoaderCircle size={11} className="spin"/> : item.ok ? <Check size={11}/> : <AlertCircle size={11}/>}
                    </span>
                    <div><strong>{item.name}</strong><span>{item.detail}</span></div>
                  </div>
                )
              : <div className="activity-empty"><Activity size={15}/><span>Tool calls and model actions appear here.</span></div>}
          </section>
          <div className="right-footer"><ShieldCheck size={13}/> Every Studio change requires your approval.</div>
        </aside>}
      </div>

      {projectDialog && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !savingProject) setProjectDialog(null); }}>
        <form className="settings-modal cloud-project-dialog" onSubmit={event => { event.preventDefault(); void handleSaveCloudProject(); }}>
          <div className="modal-header">
            <div>
              <div className="modal-kicker">CLOUD PROJECT WORKSPACE</div>
              <h2>{projectDialog.mode === 'create' ? 'Create a project' : 'Rename project'}</h2>
              <p>Keep project files, AI conversations, architecture notes and development tasks organized together.</p>
            </div>
            <button type="button" className="icon-button" disabled={savingProject} onClick={() => setProjectDialog(null)}><X size={17}/></button>
          </div>
          <label className="field-label" htmlFor="cloud-project-name">PROJECT NAME</label>
          <input id="cloud-project-name" className="settings-input" value={projectDialog.name} onChange={event => setProjectDialog(current => current ? { ...current, name: event.target.value } : current)} placeholder="My Roblox game" maxLength={100} required autoFocus/>
          <label className="field-label" htmlFor="cloud-project-description">DESCRIPTION</label>
          <textarea id="cloud-project-description" className="settings-input project-description-input" value={projectDialog.description} onChange={event => setProjectDialog(current => current ? { ...current, description: event.target.value } : current)} placeholder="What are you building? Key systems, genre and current goals…" maxLength={2000} rows={4}/>
          <div className="modal-footer">
            <button type="button" className="cancel-button" disabled={savingProject} onClick={() => setProjectDialog(null)}>Cancel</button>
            <button type="submit" className="save-button" disabled={savingProject || !projectDialog.name.trim()}>
              {savingProject ? <LoaderCircle size={14} className="spin"/> : projectDialog.mode === 'create' ? <Plus size={14}/> : <Check size={14}/>}
              {projectDialog.mode === 'create' ? 'Create project' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>}

      {projectChangesOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setProjectChangesOpen(false); }}>
        <div className="settings-modal project-changes-modal">
          <div className="modal-header">
            <div>
              <div className="modal-kicker">CLOUD PROJECT WORKSPACE</div>
              <h2>Review proposed changes</h2>
              <p>Nothing is applied until you approve it. Approved files become part of the private cloud project ZIP.</p>
            </div>
            <button type="button" className="icon-button" onClick={() => setProjectChangesOpen(false)}><X size={17}/></button>
          </div>
          {cloudProjectChanges.length === 0
            ? <div className="tools-empty"><FileCode2 size={18}/><span>No proposed changes yet. Ask Rmango Agent to edit a file in your uploaded cloud project.</span></div>
            : <div className="project-change-list">
              {cloudProjectChanges.map(change =>
                <div className="project-change-card" key={change.id}>
                  <div className="project-change-heading">
                    <div><strong>{change.file_name}</strong><small>{change.relative_path}</small></div>
                    <span className={'change-status ' + change.status}>{change.status.toUpperCase()}</span>
                  </div>
                  <p>{change.change_summary}</p>
                  <div className="project-change-meta"><span>Created {displayTime(change.created_at)}</span><span>{change.original_sha256 ? 'Existing file' : 'New file'}</span></div>
                  {change.status === 'pending' && <div className="project-change-actions">
                    <button type="button" className="deny-button" disabled={reviewingChangeId === change.id} onClick={() => void handleReviewProjectChange(change, 'reject')}>Reject</button>
                    <button type="button" className="approve-button" disabled={reviewingChangeId === change.id} onClick={() => void handleReviewProjectChange(change, 'approve')}>
                      {reviewingChangeId === change.id ? <LoaderCircle size={13} className="spin"/> : <Check size={13}/>} Approve and apply
                    </button>
                  </div>}
                </div>
              )}
            </div>}
          <div className="modal-footer">
            <button type="button" className="cancel-button" onClick={() => setProjectChangesOpen(false)}>Close</button>
            {cloudProjectId && <button type="button" className="save-button" onClick={() => void handleDownloadCloudProject()}><Download size={13}/> Download ZIP</button>}
          </div>
        </div>
      </div>}

      {pendingApproval && <div className="approval-backdrop">
        <div className="approval-modal">
          <div className="approval-icon"><ShieldCheck size={21}/></div>
          <div className="approval-kicker">ROBLOX STUDIO ACTION</div>
          <h2>Approve this change?</h2>
          <p>Rmango wants to run <strong>{pendingApproval.name}</strong> in your connected Roblox Studio session. Review the tool arguments before continuing.</p>
          <div className="approval-description">{pendingApproval.description}</div>
          <pre className="approval-json">{JSON.stringify(pendingApproval.arguments, null, 2)}</pre>
          <div className="approval-actions">
            <button className="deny-button" disabled={approvalBusy} onClick={() => void respondToApproval(false)}>Deny</button>
            <button className="approve-button" disabled={approvalBusy} onClick={() => void respondToApproval(true)}>{approvalBusy ? <LoaderCircle size={14} className="spin"/> : <Check size={14}/>} Approve action</button>
          </div>
          <span className="approval-footnote">No Studio change happens until you approve.</span>
        </div>
      </div>}

      {settingsOpen && <div className="modal-backdrop settings-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
        <section className="settings-modal settings-center" role="dialog" aria-modal="true" aria-label="Rmango settings">
          <header className="settings-center-header">
            <div className="settings-center-brand">
              <div className="settings-center-mark"><MangoMark size={25}/></div>
              <div>
                <div className="settings-center-kicker">RMANGO PREFERENCES</div>
                <strong>Settings</strong>
              </div>
            </div>
            <div className="settings-center-header-right">
              <span className="settings-autosave"><CheckCircle2 size={13}/> Saved automatically</span>
              <button type="button" className="icon-button" aria-label="Close settings" onClick={() => setSettingsOpen(false)}><X size={17}/></button>
            </div>
          </header>

          <div className="settings-center-body">
            <aside className="settings-nav">
              {['WORKSPACE', 'AI', 'ACCOUNT', 'APP'].map(group => (
                <div className="settings-nav-group" key={group}>
                  <div className="settings-nav-group-title">{group}</div>
                  {SETTINGS_NAVIGATION.filter(item => item.group === group).map(item => {
                    const Icon = item.icon;
                    return (
                      <button
                        type="button"
                        key={item.id}
                        className={'settings-nav-item ' + (settingsSection === item.id ? 'active' : '')}
                        onClick={() => setSettingsSection(item.id)}
                        aria-current={settingsSection === item.id ? 'page' : undefined}
                      >
                        <Icon size={16}/>
                        <span className="settings-nav-item-copy">
                          <strong>{item.label}</strong>
                          <small>{item.description}</small>
                        </span>
                        {settingsSection === item.id && <span className="settings-nav-indicator"/>}
                      </button>
                    );
                  })}
                </div>
              ))}
              <div className="settings-nav-footer">
                <span className="settings-nav-version">RMANGO DESKTOP</span>
                <strong>v{appState?.appVersion || '—'}</strong>
                <small>Windows workspace</small>
              </div>
            </aside>

            <main className="settings-main">
              <div className="settings-page-heading">
                <div>
                  <div className="settings-page-eyebrow">{SETTINGS_NAVIGATION.find(item => item.id === settingsSection)?.group || 'WORKSPACE'}</div>
                  <h2>{SETTINGS_NAVIGATION.find(item => item.id === settingsSection)?.label || 'General'}</h2>
                  <p>{SETTINGS_NAVIGATION.find(item => item.id === settingsSection)?.description || 'Manage your Rmango workspace.'}</p>
                </div>
                <span className="settings-page-save"><Check size={12}/> Changes save as you make them</span>
              </div>

              <div className="settings-page-scroll">
                {settingsSection === 'general' && <>
                  <section className="settings-card">
                    <div className="settings-card-heading">
                      <div className="settings-card-icon"><Keyboard size={17}/></div>
                      <div><h3>Keyboard & composer</h3><p>Choose how messages are sent from the chat box.</p></div>
                    </div>
                    <div className="settings-row">
                      <div><strong>Enter to send</strong><small>Press Enter to send. Turn this off to use Enter for a new line.</small></div>
                      <button type="button" role="switch" aria-checked={sendOnEnter} className={'preference-switch ' + (sendOnEnter ? 'on' : '')} onClick={() => { const value = !sendOnEnter; setSendOnEnter(value); void savePreferences({ sendOnEnter: value }); }}><i/></button>
                    </div>
                    <div className="settings-shortcut-row">
                      <div><strong>Open Settings</strong><small>Open this panel from anywhere in Rmango.</small></div>
                      <kbd>{appState?.platform === 'darwin' ? '⌘' : 'Ctrl'}</kbd><span>+</span><kbd>,</kbd>
                    </div>
                    <div className="settings-shortcut-row">
                      <div><strong>Toggle project sidebar</strong><small>Show or hide the project explorer.</small></div>
                      <kbd>{appState?.platform === 'darwin' ? '⌘' : 'Ctrl'}</kbd><span>+</span><kbd>B</kbd>
                    </div>
                    <div className="settings-shortcut-row">
                      <div><strong>Toggle session inspector</strong><small>Show or hide Studio status and task activity.</small></div>
                      <kbd>{appState?.platform === 'darwin' ? '⌘' : 'Ctrl'}</kbd><span>+</span><kbd>Shift</kbd><span>+</span><kbd>I</kbd>
                    </div>
                    <div className="settings-shortcut-row">
                      <div><strong>Focus chat composer</strong><small>Jump directly to the message box.</small></div>
                      <kbd>{appState?.platform === 'darwin' ? '⌘' : 'Ctrl'}</kbd><span>+</span><kbd>L</kbd>
                    </div>
                  </section>

                  <section className="settings-card">
                    <div className="settings-card-heading">
                      <div className="settings-card-icon"><PanelRight size={17}/></div>
                      <div><h3>Workspace layout</h3><p>Choose which supporting panels appear when Rmango starts.</p></div>
                    </div>
                    <div className="settings-row">
                      <div><strong>Open inspector by default</strong><small>Remember the right-side activity and Studio panel as your startup layout.</small></div>
                      <button type="button" role="switch" aria-checked={showInspectorByDefault} className={'preference-switch ' + (showInspectorByDefault ? 'on' : '')} onClick={() => void handleInspectorDefaultChange(!showInspectorByDefault)}><i/></button>
                    </div>
                  </section>

                  <section className="settings-tip">
                    <Info size={16}/>
                    <div><strong>Your settings are saved automatically</strong><p>Changes are stored locally for this device account. You do not need to press a Save button.</p></div>
                  </section>
                </>}

                {settingsSection === 'appearance' && <>
                  <section className="settings-card">
                    <div className="settings-card-heading">
                      <div className="settings-card-icon"><Palette size={17}/></div>
                      <div><h3>Color theme</h3><p>Choose the look that feels comfortable in your workspace.</p></div>
                    </div>
                    <div className="theme-options settings-theme-options" role="group" aria-label="Application appearance">
                      <button type="button" className={'theme-option ' + (theme === 'dark' ? 'selected' : '')} onClick={() => void handleThemeChange('dark')}>
                        <span className="theme-preview theme-preview-dark"><i/><i/><i/></span><strong>Dark</strong><small>Graphite and mango</small>
                      </button>
                      <button type="button" className={'theme-option ' + (theme === 'light' ? 'selected' : '')} onClick={() => void handleThemeChange('light')}>
                        <span className="theme-preview theme-preview-light"><i/><i/><i/></span><strong>Light</strong><small>Bright and clean</small>
                      </button>
                      <button type="button" className={'theme-option ' + (theme === 'system' ? 'selected' : '')} onClick={() => void handleThemeChange('system')}>
                        <span className="theme-preview theme-preview-system"><i/><i/><i/></span><strong>System</strong><small>Follow Windows</small>
                      </button>
                    </div>
                  </section>

                  <section className="settings-card">
                    <div className="settings-card-heading">
                      <div className="settings-card-icon"><SlidersHorizontal size={17}/></div>
                      <div><h3>Layout & readability</h3><p>Adjust spacing and text without changing your project files.</p></div>
                    </div>
                    <label className="settings-select-row">
                      <span><strong>Interface density</strong><small>Comfortable gives rows more room. Compact fits more on screen.</small></span>
                      <select className="settings-input" value={density} onChange={event => { const value = event.target.value as 'comfortable' | 'compact'; setDensity(value); void savePreferences({ density: value }); }}>
                        <option value="comfortable">Comfortable</option><option value="compact">Compact</option>
                      </select>
                    </label>
                    <label className="settings-select-row">
                      <span><strong>Text size</strong><small>Change the size of chat message text.</small></span>
                      <select className="settings-input" value={fontSize} onChange={event => { const value = event.target.value as 'small' | 'medium' | 'large'; setFontSize(value); void savePreferences({ fontSize: value }); }}>
                        <option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option>
                      </select>
                    </label>
                  </section>

                  <section className="settings-card">
                    <div className="settings-card-heading">
                      <div className="settings-card-icon"><Sparkles size={17}/></div>
                      <div><h3>Motion</h3><p>Control transitions and animated interface details.</p></div>
                    </div>
                    <div className="settings-row">
                      <div><strong>Interface animations</strong><small>Enable subtle transitions and interactive motion effects.</small></div>
                      <button type="button" role="switch" aria-checked={animationsEnabled} className={'preference-switch ' + (animationsEnabled ? 'on' : '')} onClick={() => { const value = !animationsEnabled; setAnimationsEnabled(value); void savePreferences({ animationsEnabled: value }); }}><i/></button>
                    </div>
                    <div className="settings-row">
                      <div><strong>Reduced motion</strong><small>Reduce movement and transitions, including when animations are enabled.</small></div>
                      <button type="button" role="switch" aria-checked={reducedMotion} className={'preference-switch ' + (reducedMotion ? 'on' : '')} onClick={() => { const value = !reducedMotion; setReducedMotion(value); void savePreferences({ reducedMotion: value }); }}><i/></button>
                    </div>
                  </section>
                </>}

                {settingsSection === 'ai' && <>
                  <section className="settings-card">
                    <div className="settings-card-heading">
                      <div className="settings-card-icon"><Cpu size={17}/></div>
                      <div><h3>Default AI profile</h3><p>Choose the hosted profile Rmango selects for new conversations. You can still change it in the chat composer.</p></div>
                    </div>
                    <label className="settings-select-row settings-default-profile">
                      <span><strong>New conversation profile</strong><small>This is a routing preset, not a separate model or a model-training setting.</small></span>
                      <select className="settings-input" value={cloudProfile} onChange={event => void handleDefaultProfileChange(event.target.value as CloudProfile)}>
                        <option value="fast">Fast · quick responses</option>
                        <option value="developer">Developer · Roblox coding</option>
                        <option value="think">Think · deeper reasoning</option>
                        <option value="vision">Vision · image understanding</option>
                        <option value="agent">Agent · multi-step tasks</option>
                      </select>
                    </label>
                  </section>

                  <section className="settings-card">
                    <div className="settings-card-heading">
                      <div className="settings-card-icon"><Layers3 size={17}/></div>
                      <div><h3>Available cloud profiles</h3><p>Live profiles and capabilities supplied by the Rmango Cloud model catalogue.</p></div>
                    </div>
                    {!cloudState?.signedIn
                      ? <div className="settings-empty"><LockKeyhole size={17}/><div><strong>Sign in to view your available profiles</strong><small>Your cloud model access appears here after you connect your account.</small></div><button type="button" className="settings-inline-button" onClick={() => setSettingsSection('account')}>Go to Account</button></div>
                      : !cloudModels?.profiles.length
                        ? <div className="settings-empty"><Cpu size={17}/><div><strong>Model catalogue unavailable</strong><small>The server has not returned any model profiles yet. Existing settings are preserved.</small></div></div>
                        : <div className="cloud-model-list settings-cloud-model-list">
                          {cloudModels.profiles.map((profile: CloudModelProfile) =>
                            <button type="button" className={'cloud-model-card ' + (cloudProfile === profile.profile ? 'selected' : '')} key={profile.profile} onClick={() => void handleDefaultProfileChange(profile.profile)}>
                              <span className="cloud-model-check">{cloudProfile === profile.profile ? <CheckCircle2 size={17}/> : <span/>}</span>
                              <span className="cloud-model-copy">
                                <strong>{profile.profileLabel}</strong>
                                <small>{profile.name}</small>
                                <span>{profile.description || 'Hosted model profile selected by the Rmango administrator.'}</span>
                                <span className="cloud-capabilities">
                                  {profile.contextWindow ? <i>{profile.contextWindow.toLocaleString()} context</i> : null}
                                  {profile.capabilities.includes('reasoning') ? <i>Reasoning</i> : null}
                                  {profile.capabilities.includes('vision') || profile.inputModalities.includes('image') ? <i>Vision</i> : null}
                                  {profile.capabilities.includes('tool-use') ? <i>Tools</i> : null}
                                </span>
                                <span className="cloud-pricing">
                                  {profile.inputUsdPerMillionTokens !== null ? 'Input $' + profile.inputUsdPerMillionTokens.toFixed(3) + '/M' : 'Input pricing unavailable'}
                                  {' · '}
                                  {profile.outputUsdPerMillionTokens !== null ? 'Output $' + profile.outputUsdPerMillionTokens.toFixed(3) + '/M' : 'Output pricing unavailable'}
                                </span>
                              </span>
                            </button>
                          )}
                        </div>}
                    <p className="settings-card-footnote">Profile availability, model names, capabilities and prices are controlled by the cloud service. Rmango does not invent benchmark scores.</p>
                  </section>
                </>}

                {settingsSection === 'usage' && <>
                  {cloudUsage ? <>
                    <section className="settings-card settings-plan-card">
                      <div className="settings-plan-top">
                        <div><div className="settings-page-eyebrow">CURRENT PLAN</div><h3>{cloudUsage.planLabel}</h3><p>{cloudUsage.unlimitedAccount ? 'Administrator account · unlimited personal quotas' : 'Your current Rmango account allowance'}</p></div>
                        <span className={'account-plan-pill ' + (cloudUsage.unlimitedAccount ? 'admin' : '')}>{cloudUsage.unlimitedAccount ? 'ADMIN' : cloudUsage.plan.toUpperCase()}</span>
                      </div>
                    </section>
                    <div className="settings-usage-grid">
                      {[
                        { label: 'Requests today', value: cloudUsage.usage.dailyRequests, limit: cloudUsage.limits.dailyRequests },
                        { label: 'Requests this month', value: cloudUsage.usage.monthlyRequests, limit: cloudUsage.limits.monthlyRequests },
                        { label: 'Tokens today', value: cloudUsage.usage.dailyTokens, limit: cloudUsage.limits.dailyTokens },
                        { label: 'Tokens this month', value: cloudUsage.usage.monthlyTokens, limit: cloudUsage.limits.monthlyTokens },
                      ].map(metric => (
                        <div className="settings-usage-metric" key={metric.label}>
                          <span>{metric.label}</span>
                          <strong>{metric.value.toLocaleString()}</strong>
                          <small>{metric.limit === null ? 'No personal limit' : 'of ' + metric.limit.toLocaleString()}</small>
                          {metric.limit !== null && <div className="settings-usage-meter"><i style={{ width: Math.min(100, metric.value / Math.max(1, metric.limit) * 100) + '%' }}/></div>}
                        </div>
                      ))}
                    </div>
                    <section className="settings-card settings-spend-card">
                      <div className="settings-card-heading">
                        <div className="settings-card-icon"><ShieldCheck size={17}/></div>
                        <div><h3>Service spending protection</h3><p>The shared cloud budget protects the service across all accounts, including administrators.</p></div>
                      </div>
                      <p className="settings-card-footnote">Unlimited personal token quotas do not remove the service-wide spending guard or per-response output safety limits.</p>
                    </section>
                    <button type="button" className="settings-secondary-button" disabled={cloudRefreshing} onClick={() => void handleRefreshUsage()}>
                      {cloudRefreshing ? <LoaderCircle size={14} className="spin"/> : <RefreshCw size={14}/>} Refresh usage
                    </button>
                  </> : <section className="settings-card">
                    <div className="settings-empty"><Gauge size={20}/><div><strong>Usage is not available yet</strong><small>Sign in to see your plan, requests, and token usage.</small></div><button type="button" className="settings-inline-button" onClick={() => setSettingsSection('account')}>Open Account</button></div>
                  </section>}
                  <p className="settings-card-footnote">Usage reflects recorded requests and active reservations from the cloud service. It is not a live estimate of provider invoices.</p>
                </>}

                {settingsSection === 'account' && <>
                  {cloudState?.signedIn ? <>
                    <section className="settings-card">
                      <div className="settings-card-heading">
                        <div className="settings-card-icon"><UserRound size={17}/></div>
                        <div><h3>Your Rmango account</h3><p>Identity and current cloud connection.</p></div>
                      </div>
                      <div className="account-card settings-account-card">
                        <div className="account-avatar"><MangoMark size={27}/></div>
                        <div className="account-copy">
                          <strong>{cloudState.displayName || cloudState.email || 'Rmango account'}</strong>
                          <span>{cloudState.email || 'Account email unavailable'}</span>
                          <span className={cloudState.emailVerified ? 'account-email-verified' : 'account-email-pending'}>{cloudState.accountVerified
                            ? (cloudState.emailVerified ? 'Email confirmed' : 'Email not confirmed')
                            : 'Verification status unavailable'}</span>
                          <span>{cloudState.serviceReady ? 'Cloud services online' : 'Connected · cloud services need attention'}</span>
                        </div>
                        <button type="button" className="cancel-button" onClick={() => void handleSignOut()}>Sign out</button>
                      </div>
                      {!cloudState.emailVerified && <div className="account-verify-callout">
                        <div><AlertCircle size={15}/><span>Your email is not confirmed yet. Confirm it to finish securing your account.</span></div>
                        <button type="button" className="verification-resend-button" onClick={() => void handleResendEmailConfirmation()} disabled={authVerificationBusy}>
                          {authVerificationBusy ? <LoaderCircle size={13} className="spin"/> : <MailCheck size={13}/>}
                          {authVerificationBusy ? 'Sending…' : 'Resend confirmation'}
                        </button>
                        {authVerificationFeedback && <p className={'verification-feedback ' + (authVerificationError ? 'is-error' : '')}>{authVerificationFeedback}</p>}
                      </div>}
                      <div className="account-device-security">
                        <div className="account-device-security-icon"><ShieldCheck size={15}/></div>
                        <div>
                          <strong>{appState?.secureStorageAvailable ? 'Device key store protected' : 'Device key store needs attention'}</strong>
                          <span>{appState?.secureStorageProvider || 'Checking operating-system key store'}{appState?.secureStorageMessage ? ' · ' + appState.secureStorageMessage : ' · Account tokens are encrypted using the operating-system key store.'}</span>
                        </div>
                        <span className={'account-device-security-status ' + (appState?.secureStorageAvailable ? 'ready' : 'warning')}>{appState?.secureStorageAvailable ? 'SECURE' : 'CHECK'}</span>
                      </div>
                      <div className="settings-inline-status">
                        <span className={'health-state ' + (cloudState.serviceReady ? 'ready' : 'blocked')}>{cloudState.serviceReady ? 'CLOUD READY' : 'CLOUD NEEDS ATTENTION'}</span>
                        <span>{cloudState.apiHost || 'Cloud endpoint status unavailable'}</span>
                      </div>
                    </section>
                  </> : <>
                    <section className="settings-card">
                      <div className="account-auth-hero">
                          <AccountSecurityVisual/>
                          <div>
                            <span className="account-auth-eyebrow">YOUR WORKSPACE, PROTECTED</span>
                            <h3>One account. Your projects stay yours.</h3>
                            <p>Email confirmation helps protect access to your cloud workspace and saved Roblox projects.</p>
                          </div>
                        </div>
                        <div className="settings-card-heading">
                        <div className="settings-card-icon"><LockKeyhole size={17}/></div>
                        <div><h3>Connect your account</h3><p>Sign in to use hosted AI, projects, and account-based conversation history.</p></div>
                      </div>
                      <div className="provider-options">
                        <button type="button" className={'provider-option ' + (authMode === 'sign-in' ? 'selected' : '')} onClick={() => { setAuthMode('sign-in'); setAuthResetSent(false); }}>
                          <span className="provider-symbol local-symbol"><LockKeyhole size={15}/></span><span><strong>Sign in</strong><small>Existing account</small></span>
                        </button>
                        <button type="button" className={'provider-option ' + (authMode === 'sign-up' ? 'selected' : '')} onClick={() => { setAuthMode('sign-up'); setAuthResetSent(false); }}>
                          <span className="provider-symbol local-symbol"><Plus size={15}/></span><span><strong>Create account</strong><small>New Rmango account</small></span>
                        </button>
                      </div>
                      {pendingVerificationEmail && <div className="verification-panel" role="status" aria-live="polite">
                        <div className="verification-panel-icon"><MailCheck size={19}/></div>
                        <div className="verification-panel-copy">
                          <strong>Check your inbox</strong>
                          <p>Verification is pending for <b>{pendingVerificationEmail}</b>. Open the confirmation link, then sign in here.</p>
                        </div>
                        <div className="verification-actions">
                          <button type="button" className="verification-resend-button" onClick={() => void handleResendEmailConfirmation()} disabled={authVerificationBusy}>
                            {authVerificationBusy ? <LoaderCircle size={13} className="spin"/> : <MailCheck size={13}/>}
                            {authVerificationBusy ? 'Sending…' : 'Resend confirmation'}
                          </button>
                          <button type="button" className="verification-change-button" onClick={() => { setPendingVerificationEmail(''); setAuthVerificationFeedback(''); setAuthVerificationError(false); }}>
                            Use another email
                          </button>
                        </div>
                        {authVerificationFeedback && <p className={'verification-feedback ' + (authVerificationError ? 'is-error' : '')}>{authVerificationFeedback}</p>}
                      </div>}
                      <form className="settings-auth-form" onSubmit={handleAuth}>
                        {authMode === 'sign-up' && <>
                          <label className="field-label" htmlFor="rmango-display-name">DISPLAY NAME</label>
                          <input id="rmango-display-name" className="settings-input" value={authDisplayName} onChange={event => setAuthDisplayName(event.target.value)} placeholder="Your name" maxLength={60}/>
                        </>}
                        <label className="field-label" htmlFor="rmango-email">EMAIL</label>
                        <input id="rmango-email" className="settings-input" type="email" value={authEmail} onChange={event => { setAuthEmail(event.target.value); setAuthResetSent(false); }} placeholder="you@example.com" autoComplete="email" required maxLength={254}/>
                        <label className="field-label" htmlFor="rmango-password">PASSWORD</label>
                        <div className="auth-password-wrap">
                          <input id="rmango-password" className="settings-input" type={showAuthPassword ? 'text' : 'password'} value={authPassword} onChange={event => setAuthPassword(event.target.value)} placeholder={authMode === 'sign-up' ? 'At least 10 characters' : 'Your password'} autoComplete={authMode === 'sign-up' ? 'new-password' : 'current-password'} required minLength={authMode === 'sign-up' ? 10 : 1} maxLength={128}/>
                          <button type="button" className="auth-password-visibility" aria-label={showAuthPassword ? 'Hide password' : 'Show password'} aria-pressed={showAuthPassword} onClick={() => setShowAuthPassword(value => !value)}>
                            {showAuthPassword ? <EyeOff size={15}/> : <Eye size={15}/>}
                          </button>
                        </div>
                        {authMode === 'sign-in' && <div className="password-recovery-row">
                          <button type="button" className="password-recovery-link" onClick={() => void handlePasswordReset()} disabled={authResetBusy || !authEmail.trim()}>
                            {authResetBusy ? <LoaderCircle size={13} className="spin"/> : <LockKeyhole size={13}/>}
                            {authResetBusy ? 'Sending recovery email…' : 'Forgot password? Send a reset link'}
                          </button>
                          {authResetSent && <p className="password-recovery-note">If an account exists for this email, a recovery link has been sent. Open it in your browser, choose a new password, then return here to sign in.</p>}
                        </div>}
                        <div className="secure-note"><LockKeyhole size={13}/><span>These are your Rmango account credentials, not an AI provider API key. Provider credentials stay on the cloud server.</span></div>
                        <div className="settings-form-actions">
                          <button type="submit" className="save-button" disabled={authBusy || !authEmail.trim() || !authPassword}>
                            {authBusy ? <LoaderCircle size={14} className="spin"/> : <ArrowRight size={14}/>}
                            {authMode === 'sign-in' ? 'Sign in' : 'Create account'}
                          </button>
                        </div>
                      </form>
                    </section>
                  </>}
                  {cloudState?.configured && <section className="settings-card">
                    <div className="settings-card-heading">
                      <div className="settings-card-icon"><Activity size={17}/></div>
                      <div><h3>Cloud connection</h3><p>Check whether the hosted services are responding.</p></div>
                    </div>
                    <div className="settings-connection-row">
                      <span className={'health-state ' + (cloudState.serviceReady ? 'ready' : 'blocked')}>{cloudState.serviceReady ? 'READY' : 'NEEDS ATTENTION'}</span>
                      <span>{cloudState.message || (cloudState.serviceReady ? 'Cloud backend is responding.' : 'Cloud readiness check did not pass.')}</span>
                    </div>
                    {cloudState.message?.includes('SUPABASE_SECRET_KEY') && <div className="cloud-setup-instructions">
                      <strong>Server setup is incomplete</strong>
                      <span>Open Vercel → rmango-cloud → Settings → Environment Variables and configure <code>SUPABASE_SECRET_KEY</code>. Keep it on the cloud server; never add it to the desktop app or source code.</span>
                      <button type="button" className="outline-action" onClick={() => void window.rmango.openExternal('https://vercel.com/abdelrmamsaahlan-3675s-projects/rmango-cloud/settings/environment-variables')}><ExternalLink size={13}/> Open Vercel settings</button>
                    </div>}
                    <button type="button" className="settings-secondary-button" disabled={cloudRefreshing} onClick={() => void handleRefreshCloud()}>
                      {cloudRefreshing ? <LoaderCircle size={14} className="spin"/> : <RefreshCw size={14}/>} Test cloud connection
                    </button>
                  </section>}
                  {!cloudState?.configured && <section className="settings-tip warning">
                    <AlertCircle size={16}/><div><strong>Cloud backend not configured</strong><p>This build does not have a cloud endpoint yet. Local AI is not started as a fallback.</p></div>
                  </section>}
                </>}

                {settingsSection === 'privacy' && <>
                  <section className="settings-card">
                    <div className="settings-card-heading">
                      <div className="settings-card-icon"><ShieldCheck size={17}/></div>
                      <div><h3>Device encryption</h3><p>Rmango uses the built-in secure key store provided by your operating system.</p></div>
                    </div>
                    <div className="account-device-security">
                      <div className="account-device-security-icon"><ShieldCheck size={15}/></div>
                      <div>
                        <strong>{appState?.secureStorageAvailable ? 'Secure storage ready' : 'Secure storage unavailable'}</strong>
                        <span>{appState?.secureStorageProvider || 'Checking your system key store'}{appState?.secureStorageMessage ? ' · ' + appState.secureStorageMessage : ' · Local account tokens are encrypted with this device key store.'}</span>
                      </div>
                      <span className={'account-device-security-status ' + (appState?.secureStorageAvailable ? 'ready' : 'warning')}>{appState?.secureStorageAvailable ? 'READY' : 'CHECK'}</span>
                    </div>
                    <p className="settings-card-footnote">Windows uses DPAPI, macOS uses Keychain, and Linux requires Secret Service or KWallet. Rmango will not fall back to plain-text key storage.</p>
                  </section>
                  <section className="settings-card">
                    <div className="settings-card-heading">
                      <div className="settings-card-icon"><HardDrive size={17}/></div>
                      <div><h3>Local chat cache</h3><p>Control whether Rmango keeps a small encrypted message cache on this device.</p></div>
                    </div>
                    <div className="settings-row">
                      <div><strong>Save recent messages on this device</strong><small>Stores up to the most recent 100 messages in the app data folder, encrypted using the operating-system key store.</small></div>
                      <button type="button" role="switch" aria-checked={saveLocalChatHistory} className={'preference-switch ' + (saveLocalChatHistory ? 'on' : '')} onClick={() => void handleLocalHistoryChange(!saveLocalChatHistory)}><i/></button>
                    </div>
                    <div className="settings-privacy-detail">
                      <span className="privacy-state">{saveLocalChatHistory ? 'LOCAL CACHE ON' : 'LOCAL CACHE OFF'}</span>
                      <p>{saveLocalChatHistory
                        ? 'Turning this off removes the local cache and prevents Rmango from writing new local copies.'
                        : 'New local cache writes are disabled. Existing cloud conversations remain available when you sign in.'}</p>
                      <button type="button" className="settings-secondary-button" disabled={!saveLocalChatHistory || messages.length === 0} onClick={() => void handleClearLocalChatCache()}>
                        <Trash2 size={14}/> Clear local chat cache
                      </button>
                    </div>
                  </section>
                  <section className="settings-card">
                    <div className="settings-card-heading">
                      <div className="settings-card-icon"><ShieldCheck size={17}/></div>
                      <div><h3>Roblox Studio safety</h3><p>Actions that change your Studio project continue to use an approval step.</p></div>
                    </div>
                    <div className="settings-security-line"><CheckCircle2 size={15}/><span>Write and destructive Studio tools require approval in the app before they run.</span></div>
                    <div className="settings-security-line"><LockKeyhole size={15}/><span>Your cloud session is encrypted with your operating-system key store, not saved as a plain-text password.</span></div>
                    <p className="settings-card-footnote">These safety checks cannot be disabled from Settings.</p>
                  </section>
                </>}

                {settingsSection === 'notifications' && <>
                  <section className="settings-card">
                    <div className="settings-card-heading">
                      <div className="settings-card-icon"><Bell size={17}/></div>
                      <div><h3>Desktop notifications</h3><p>Choose when Rmango is allowed to show a Windows notification.</p></div>
                    </div>
                    <div className="settings-row">
                      <div><strong>Notify when a response finishes</strong><small>Only appears when Rmango is in the background, minimized, or not focused.</small></div>
                      <button type="button" role="switch" aria-checked={desktopNotifications} className={'preference-switch ' + (desktopNotifications ? 'on' : '')} onClick={() => { const value = !desktopNotifications; setDesktopNotifications(value); void savePreferences({ desktopNotifications: value }); }}><i/></button>
                    </div>
                  </section>
                  <section className="settings-tip"><Info size={16}/><div><strong>Windows notification permissions</strong><p>Your operating system may also control whether notifications from Rmango are shown. This switch controls Rmango's own notification behavior.</p></div></section>
                </>}

                {settingsSection === 'updates' && <>
                  <section className="settings-card">
                    <div className="settings-card-heading">
                      <div className="settings-card-icon"><Download size={17}/></div>
                      <div><h3>Stable releases</h3><p>Keep Rmango up to date without installing updates automatically.</p></div>
                    </div>
                    <div className="settings-version-row">
                      <div><span>CURRENT VERSION</span><strong>{appState?.appVersion || '—'}</strong></div>
                      <div><span>PLATFORM</span><strong>{appState?.platform || '—'}</strong></div>
                    </div>
                    <div className="settings-row">
                      <div><strong>Automatic update checks</strong><small>{appState?.platform === 'win32' ? 'Check for the newest stable release every five minutes. Rmango validates its cached installer and downloads only when the verified update file is missing. Install only when you choose.' : appState?.platform === 'darwin' ? 'macOS releases are installed from signed and notarized DMG downloads. Automatic in-app updates are not enabled for this build.' : appState?.platform === 'linux' ? 'Linux releases are installed from AppImage or DEB packages. Automatic updates remain disabled until signed manifests are configured.' : 'Automatic updates are not configured for this platform.'}</small></div>
                      <button type="button" role="switch" aria-checked={autoUpdatesEnabled} aria-label="Automatic update checks" disabled={appState?.platform !== 'win32'} className={'preference-switch ' + (autoUpdatesEnabled ? 'on' : '')} onClick={() => { const value = !autoUpdatesEnabled; setAutoUpdatesEnabled(value); void savePreferences({ autoUpdatesEnabled: value }); }}><i/></button>
                    </div>
                    <div className="settings-update-status">
                      <span className={'health-state ' + (updateState?.status === 'error' ? 'blocked' : updateState?.status === 'downloaded' || updateState?.status === 'not-available' ? 'ready' : '')}>{(updateState?.status || 'idle').replace('-', ' ').toUpperCase()}</span>
                      <p>{updateState?.message || 'Update status is not available yet.'}</p>
                      {updateState?.error && <p className="settings-error-text">{updateState.error}</p>}
                      {typeof updateState?.progress === 'number' && updateState.status === 'downloading' && <div className="settings-usage-meter"><i style={{ width: Math.max(0, Math.min(100, updateState.progress)) + '%' }}/></div>}
                    </div>
                    {updateState?.releaseNotes && <details className="settings-release-notes"><summary>Release notes</summary><p>{updateState.releaseNotes}</p></details>}
                    <div className="settings-form-actions">
                      <button type="button" className="settings-secondary-button" onClick={() => void handleCheckUpdates()} disabled={appState?.platform !== 'win32' || updateState?.status === 'checking' || updateState?.status === 'downloading' || updateState?.status === 'downloaded'}>
                        {updateState?.status === 'checking' ? <LoaderCircle size={14} className="spin"/> : <RefreshCw size={14}/>} Check now
                      </button>
                      {updateState?.status === 'downloaded' && <button type="button" className="save-button" onClick={() => void handleInstallUpdate()}><Download size={14}/> Install and restart</button>}
                    </div>
                  </section>
                </>}

                {settingsSection === 'advanced' && <>
                  <section className="settings-card">
                    <div className="settings-card-heading">
                      <div className="settings-card-icon"><Wrench size={17}/></div>
                      <div><h3>Roblox Studio diagnostics</h3><p>Inspect the connected Studio bridge and its available read-only checks.</p></div>
                    </div>
                    <button type="button" className="settings-secondary-button" onClick={() => void handleDiagnostics()} disabled={diagnosing || !appState?.studioConnected}>
                      {diagnosing ? <LoaderCircle size={14} className="spin"/> : <Activity size={14}/>} {diagnosing ? 'Running diagnostics…' : 'Run Studio diagnostics'}
                    </button>
                    {!appState?.studioConnected && <p className="settings-card-footnote">Connect the Roblox Studio bridge first to run these checks.</p>}
                    {diagnosticResult && <pre className="settings-diagnostic-output">{diagnosticResult}</pre>}
                  </section>
                  <section className="settings-card">
                    <div className="settings-card-heading">
                      <div className="settings-card-icon"><RefreshCw size={17}/></div>
                      <div><h3>Reset preferences</h3><p>Restore appearance, workspace, model default, notifications and update preferences.</p></div>
                    </div>
                    <p className="settings-card-footnote">This does not delete your Rmango account, cloud conversations, projects, or Roblox Studio files.</p>
                    <button type="button" className="settings-danger-quiet" onClick={() => void handleResetPreferences()}><RefreshCw size={14}/> Reset all preferences</button>
                  </section>
                  <section className="settings-tip"><Info size={16}/><div><strong>Need more details?</strong><p>Use the Inspector in the main workspace for live task activity, Studio connection state, and operation details.</p></div></section>
                </>}
              </div>
            </main>
          </div>
          <footer className="settings-center-footer">
            <span>Press <kbd>Ctrl</kbd> + <kbd>,</kbd> to open Settings</span>
            <button type="button" className="settings-footer-close" onClick={() => setSettingsOpen(false)}>Done</button>
          </footer>
        </section>
      </div>}
      {toast && <div className="toast"><CheckCircle2 size={15}/>{toast}</div>}
    </div>
  );
}

export default App;
