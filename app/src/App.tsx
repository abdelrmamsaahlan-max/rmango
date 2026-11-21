import { ChangeEvent, DragEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AgentWorkspace } from './AgentWorkspace';
import {
  Activity, AlertCircle, ArrowRight, Bot, Check, CheckCircle2, ChevronDown, CircleHelp,
  Code2, Cpu, Download, ExternalLink, FileCode2, FileJson, FileText, Folder,
  FolderOpen, Gamepad2, Image as ImageIcon, Link2, LoaderCircle, Menu,
  LockKeyhole, MessageSquare, MoreHorizontal, Paperclip, Plus, RefreshCw, Search, Send,
  Settings2, ShieldCheck, Sparkles, Upload, Wrench, X, Layers3
} from 'lucide-react';
import type {
  AppState, AttachmentPayload, ChatAttachment, ChatMessage, CloudModelProfile, CloudModels, CloudProjectChange,
  CloudProfile, CloudState, ProjectFile, StudioApprovalRequest, UpdateState
} from './types';

type ActivityItem = { name: string; detail: string; ok: boolean };
type PendingAttachment = AttachmentPayload & { id: string; previewUrl?: string };

const profileCopy: Record<CloudProfile, { title: string; description: string; tags: string[] }> = {
  agent: { title: "Agent", description: "Best for full Roblox tasks: inspect the project, plan the work, use Studio tools, and verify the result.", tags: ["Project context", "Studio tools", "Reasoning"] },
  developer: { title: "Build", description: "Focused on Luau, architecture, debugging, and implementing Roblox systems.", tags: ["Luau", "Studio tools"] },
  think: { title: "Deep Think", description: "For difficult bugs, system design, trade-offs, and multi-step technical reasoning.", tags: ["Reasoning", "Planning"] },
  fast: { title: "Quick", description: "Fast answers, small fixes, explanations, and everyday development questions.", tags: ["Fast responses"] },
  vision: { title: "Vision", description: "Understand screenshots, UI references, error images, and visual Roblox layouts.", tags: ["Vision", "Images"] },
};


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

function FileGlyph({ file }: { file: ProjectFile }) {
  if (file.kind === 'folder') return <Folder size={14} className="file-icon folder-icon" />;
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (['lua', 'luau', 'ts', 'tsx', 'js'].includes(ext || '')) return <FileCode2 size={14} className="file-icon code-icon" />;
  if (ext === 'json') return <FileJson size={14} className="file-icon json-icon" />;
  return <FileText size={14} className="file-icon" />;
}

function encodeTextBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
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
  if (ext === 'json') return 'application/json';
  if (textExts.includes(ext || '')) return 'text/plain';
  return 'application/octet-stream';
}

function App() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [cloudState, setCloudState] = useState<CloudState | null>(null);
  const [cloudModels, setCloudModels] = useState<CloudModels | null>(null);
  const [cloudProfile, setCloudProfile] = useState<CloudProfile>('agent');
  const [activeView, setActiveView] = useState<'chat' | 'workspace'>('chat');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [cloudProjectId, setCloudProjectId] = useState<string | undefined>();
  const [cloudProjectChanges, setCloudProjectChanges] = useState<CloudProjectChange[]>([]);
  const [projectChangesOpen, setProjectChangesOpen] = useState(false);
  const [reviewingChangeId, setReviewingChangeId] = useState<string | null>(null);
  const [uploadingProject, setUploadingProject] = useState(false);
  const [projectUploadProgress, setProjectUploadProgress] = useState<{ completed: number; total: number; uploaded: number; skipped: number; currentFile: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [studioTools, setStudioTools] = useState<string[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [diagnosticResult, setDiagnosticResult] = useState('');
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
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

  useEffect(() => {
    const unsubscribeUpdates = window.rmango.onUpdateStatus(state => setUpdateState(state));
    const unsubscribeDeltas = window.rmango.onCloudChatDelta(({ requestId, delta }) => {
      setMessages(current => current.map(message =>
        message.id === requestId ? { ...message, content: message.content + delta } : message
      ));
    });
    const unsubscribeProjectUpload = window.rmango.onProjectUploadProgress(progress => {
      setProjectUploadProgress(progress);
    });
    void window.rmango.getUpdateState().then(setUpdateState).catch(() => undefined);

    Promise.all([window.rmango.getAppState(), window.rmango.getCloudState(), window.rmango.loadMessages()])
      .then(async ([state, cloud, savedMessages]) => {
        setAppState(state);
        setProjectFiles(state.projectFiles || []);
        setCloudState(cloud);
        if (cloud.currentProjectId) {
          setCloudProjectId(cloud.currentProjectId);
          try {
            const changeList = await window.rmango.getCloudProjectChanges(cloud.currentProjectId);
            setCloudProjectChanges(changeList.changes || []);
          } catch { /* Existing cloud project may no longer be accessible. */ }
        }
        setMessages(savedMessages || []);
        if (state.studioConnected) void refreshMcpState();
        if (cloud.signedIn && cloud.serviceReady) {
          try { setCloudModels(await window.rmango.getCloudModels()); }
          catch (error) { setToast(error instanceof Error ? error.message : 'Could not load cloud models.'); }
        }
      })
      .catch(() => setToast('Could not load Rmango cloud state. Check the backend configuration.'))
      .finally(() => setCloudLoading(false));

    return () => {
      unsubscribeUpdates();
      unsubscribeDeltas();
      unsubscribeProjectUpload();
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy, pendingApproval]);

  useEffect(() => {
    if (messages.length) void window.rmango.saveMessages(messages);
  }, [messages]);

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
    setStudioCloudLinked(Boolean(state.cloudLinked));
    setAppState(prev => prev ? { ...prev, studioConnected: state.connected, studioToolCount: state.toolCount } : prev);
  }

  async function refreshCloudState() {
    const state = await window.rmango.getCloudState();
    setCloudState(state);
    if (state.signedIn && state.serviceReady) {
      try { setCloudModels(await window.rmango.getCloudModels()); }
      catch (error) { setToast(error instanceof Error ? error.message : 'Could not load cloud models.'); }
    } else {
      setCloudModels(null);
    }
    return state;
  }

  async function handleAuth(event: FormEvent) {
    event.preventDefault();
    if (authBusy) return;
    setAuthBusy(true);
    try {
      if (authMode === 'sign-in') {
        await window.rmango.cloudSignIn({ email: authEmail.trim(), password: authPassword });
      } else {
        const result = await window.rmango.cloudSignUp({
          email: authEmail.trim(),
          password: authPassword,
          displayName: authDisplayName.trim() || undefined,
        });
        if (result.requiresEmailConfirmation) {
          setToast('Check your email to confirm your Rmango account, then sign in.');
          setAuthMode('sign-in');
          setAuthPassword('');
          return;
        }
      }
      setAuthPassword('');
      const state = await refreshCloudState();
      setToast(state.serviceReady ? 'Signed in to Rmango Cloud.' : (state.message || 'Signed in, but cloud services need administrator setup.'));
      if (state.serviceReady) setSettingsOpen(false);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not authenticate with Rmango Cloud.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    try {
      await window.rmango.cloudSignOut();
      setCloudState(await window.rmango.getCloudState());
      setCloudModels(null);
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
      setSettingsOpen(true);
      setToast('Sign in to a configured Rmango Cloud account before uploading this project.');
      return;
    }
    setUploadingProject(true);
    setProjectUploadProgress({ completed: 0, total: 0, uploaded: 0, skipped: 0, currentFile: 'Preparing project…' });
    try {
      const result = await window.rmango.uploadCloudProject();
      setCloudProjectId(result.projectId);
      const changeList = await window.rmango.getCloudProjectChanges(result.projectId);
      setCloudProjectChanges(changeList.changes || []);
      setToast('Uploaded ' + result.uploaded + ' source files to your private cloud project.' + (result.skipped.length ? ' ' + result.skipped.length + ' files were skipped.' : ''));
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
        await refreshMcpState();
        await refreshMcpState();
        setToast(result.cloudLinked
          ? 'Roblox Studio linked to Rmango Cloud · ' + result.toolCount + ' tools discovered'
          : (result.cloudMessage || ('Studio connected locally · sign in to link Rmango · ' + result.toolCount + ' tools')));
      } else {
        setToast(result.error || 'Could not connect to Roblox Studio.');
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Connection failed.');
    } finally {
      setConnecting(false);
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
    for (const file of files) {
      const mimeType = inferMimeType(file);
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isImage = /^image\/(png|jpeg|webp|gif)$/i.test(mimeType);
      const isText = allowedTextExtensions.has(ext) && (/^text\/|application\/json/i.test(mimeType) || mimeType === 'application/octet-stream');
      if (!isImage && !isText) {
        setToast('Unsupported file: ' + file.name + '. Add an image or a text/code file.');
        continue;
      }
      const maxBytes = isImage ? 8 * 1024 * 1024 : 512 * 1024;
      if (file.size > maxBytes) {
        setToast(file.name + ' is too large. Images: 8 MB max; text files: 512 KB max.');
        continue;
      }
      try {
        if (isImage) {
          const dataUrl = await readDataUrl(file);
          next.push({
            id: crypto.randomUUID(), name: file.name, mimeType, kind: 'image', size: file.size,
            data: dataUrl.split(',')[1] || '', previewUrl: dataUrl,
          });
        } else {
          next.push({
            id: crypto.randomUUID(), name: file.name,
            mimeType: mimeType === 'application/octet-stream' ? 'text/plain' : mimeType,
            kind: 'file', size: file.size, data: encodeTextBase64(await file.text()),
          });
        }
      } catch (error) {
        setToast(error instanceof Error ? error.message : 'Could not attach ' + file.name + '.');
      }
    }
    if (next.length) {
      setAttachments(current => [...current, ...next]);
      setToast(next.length + (next.length === 1 ? ' attachment added.' : ' attachments added.'));
    }
  }

  async function sendMessage(content = input, selectedProfile?: CloudProfile) {
    const trimmed = content.trim();
    if ((!trimmed && attachments.length === 0) || busy) return;
    if (!cloudState?.configured || !cloudState.serviceReady) {
      setSettingsOpen(true);
      setToast(cloudState?.message || 'Rmango Cloud has not been configured by the administrator yet.');
      return;
    }
    if (!cloudState.signedIn) {
      setSettingsOpen(true);
      setToast('Sign in to your Rmango account to use Rmango Intelligence.');
      return;
    }

    const pending = [...attachments];
    const requestId = crypto.randomUUID();
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
    const nextMessages = [...messages, userMessage];
    setMessages([...nextMessages, assistantPlaceholder]);
    setInput('');
    setAttachments([]);
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
      if (result.conversationId) setConversationId(result.conversationId);
      setActivities(result.activity || []);
      setMessages(current => current.map(message =>
        message.id === requestId ? { ...message, content: result.content, modelProfile: result.profile } : message
      ));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The Rmango cloud request failed.';
      setMessages(current => current.map(item =>
        item.id === requestId
          ? { ...item, content: 'I could not complete that request.\n\n' + message }
          : item
      ));
      if (pending.length) setAttachments(current => [...pending, ...current].slice(0, 8));
    } finally {
      setBusy(false);
      composerRef.current?.focus();
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

  function handleComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
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
      : 'image/png,image/jpeg,image/webp,image/gif,.lua,.luau,.txt,.md,.json,.csv,.xml,.yaml,.yml,.toml,.js,.jsx,.ts,.tsx,.css,.html';
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
        ? 'CLOUD SETUP REQUIRED'
        : cloudState.signedIn
          ? 'RMANGO READY'
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
      onDragOver={event => { event.preventDefault(); setDragActive(true); }}
      onDragLeave={event => { if (event.currentTarget === event.target) setDragActive(false); }}
      onDrop={handleDrop}
    >
      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand-tile"><MangoMark size={32}/></div>
          <span className="brand-name">rmango</span>
          <span className="brand-version">ROBLOX AI</span>
        </div>
        <div className="topbar-divider"/>
        <div className="workspace-crumb"><Gamepad2 size={15}/><span>Roblox workspace</span><ChevronDown size={13}/></div>
        <div className="topbar-spacer"/>
        <button className={'runtime-pill ' + (cloudReady ? 'ready' : '')} onClick={() => setSettingsOpen(true)}>
          <span className="runtime-dot"/>{cloudStatusLabel}
        </button>
        {cloudState?.signedIn
          ? <button className="top-settings" onClick={() => setSettingsOpen(true)} title="Cloud account">{cloudState.email || 'Account'}</button>
          : <button className="top-settings" onClick={() => setSettingsOpen(true)}>Sign in</button>}
        <div className={'connection-pill ' + (studioConnected ? 'connected' : '')}>
          <span className="status-dot"/>{studioConnected ? 'Studio connected' : 'Studio offline'}
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
        <button className="top-settings" onClick={() => setSettingsOpen(true)}><Settings2 size={15}/> Settings</button>
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
          <button className={'rail-button ' + (activeView === 'chat' ? 'active' : '')} title="AI chat" onClick={() => setActiveView('chat')}><MessageSquare size={18}/></button>
          <button className={'rail-button ' + (activeView === 'workspace' ? 'active' : '')} title="Agent workspace" onClick={() => setActiveView('workspace')}><Layers3 size={18}/></button>
          <button className="rail-button" title="Studio tools" onClick={() => setRightPanelOpen(true)}><Wrench size={18}/></button>
          <div className="rail-spacer"/>
          <button className="rail-button" title="Settings" onClick={() => setSettingsOpen(true)}><Settings2 size={18}/></button>
        </nav>

        <aside className="left-sidebar">
          <div className="sidebar-heading"><span>WORKSPACE</span><button className="subtle-icon" title="Workspace menu"><MoreHorizontal size={16}/></button></div>
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
          <div className="sidebar-bottom">
            <div className="section-row"><span>CONNECTIONS</span><span className={'tiny-status ' + (studioConnected ? 'on' : '')}/></div>
            <div className="integration-row">
              <div className="integration-icon roblox"><Gamepad2 size={14}/></div>
              <div><strong>Roblox Studio</strong><span>{studioConnected ? studioTools.length + ' tools available' : 'Not connected'}</span></div>
              <button className="subtle-icon" title={studioConnected ? 'Disconnect' : 'Connect'} onClick={() => studioConnected ? void handleDisconnect() : void handleConnect()}>{studioConnected ? <Check size={14}/> : <Link2 size={14}/>}</button>
            </div>
            <div className="integration-row">
              <div className="integration-icon local"><Sparkles size={14}/></div>
              <div><strong>Rmango Intelligence</strong><span>{cloudState?.signedIn ? (cloudReady ? 'Connected · ' + (currentProfile?.profileLabel || 'Profile ready') : 'Account connected') : cloudState?.configured ? 'Sign in required' : 'Backend not configured'}</span></div>
              <button className="subtle-icon" title="Rmango account and work modes" onClick={() => setSettingsOpen(true)}><Settings2 size={13}/></button>
            </div>
          </div>
        </aside>

        <main className="main-panel">
          <div className="main-toolbar">
            <div className="main-view-tabs">
              <button className={activeView === 'chat' ? 'selected' : ''} onClick={() => setActiveView('chat')}><MessageSquare size={13}/> Chat</button>
              <button className={activeView === 'workspace' ? 'selected' : ''} onClick={() => setActiveView('workspace')}><Layers3 size={13}/> Agent workspace</button>
            </div>
            <div className="toolbar-actions">
              <span className="model-chip"><Sparkles size={12}/>{currentProfile?.profileLabel || 'Rmango Agent'}</span>
              <button className="subtle-icon" title="Toggle inspector" onClick={() => setRightPanelOpen(value => !value)}><Menu size={16}/></button>
            </div>
          </div>

          {activeView === 'chat' ? <>
          <div className="chat-scroll">
            <div className="chat-content">
              {messages.length === 0 ? (
                <div className="welcome-block">
                  <div className="welcome-orb"><div className="welcome-logo"><MangoMark size={66}/></div><span className="orb-spark spark-one"/><span className="orb-spark spark-two"/><span className="orb-spark spark-three"/></div>
                  <div className="welcome-eyebrow"><span className="eyebrow-line"/> YOUR ROBLOX DEVELOPMENT PARTNER <span className="eyebrow-line"/></div>
                  <h1>Your Roblox ideas,<br/><em>built with Rmango.</em></h1>
                  <p>A Roblox-focused development agent that understands your project, works with your Studio tools, and shows exactly what it changed.</p>

                  {!cloudReady && <div className="setup-card">
                    <div className="setup-card-icon"><Sparkles size={19}/></div>
                    <div className="setup-card-copy">
                      <strong>{cloudState?.configured ? 'Connect your Rmango account' : 'Rmango Cloud setup required'}</strong>
                      <span>{cloudState?.message || 'Rmango runs through its hosted intelligence service. No local model downloads are required.'}</span>
                    </div>
                    <button onClick={() => setSettingsOpen(true)}>{cloudState?.configured ? 'Sign in' : 'Details'} <ArrowRight size={13}/></button>
                  </div>}

                  <div className="quick-grid">
                    {quickPrompts.map(item =>
                      <button className="quick-card" key={item.label} onClick={() => void sendMessage(item.prompt, 'agent')}>
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
                          {message.role === 'assistant' && <span className="agent-tag"><Sparkles size={10}/> {'RMANGO ' + (message.modelProfile || 'AGENT').toUpperCase()}</span>}
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
                        <div className="message-content">{message.content}</div>
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
            <div className="composer-box">
              <textarea
                ref={composerRef}
                rows={2}
                value={input}
                onChange={event => setInput(event.target.value)}
                onKeyDown={handleComposerKey}
                placeholder="Ask Rmango to inspect, design, code, or improve your Roblox game…"
              />
              <div className="composer-footer">
                <div className="composer-left">
                  <select className="profile-select" value={cloudProfile} onChange={event => setCloudProfile(event.target.value as CloudProfile)} title="Rmango work mode" disabled={!cloudState?.signedIn || busy}>
                    <option value="fast">Quick</option>
                    <option value="developer">Build</option>
                    <option value="think">Deep Think</option>
                    <option value="vision">Vision</option>
                    <option value="agent">Agent</option>
                  </select>
                  <button className="attach-button" title="Attach images or files" onClick={() => openFilePicker(false)}><Paperclip size={14}/> Attach</button>
                  <button className="attach-button attach-image" title="Attach photo" onClick={() => openFilePicker(true)}><ImageIcon size={14}/> Photo</button>
                  <input ref={fileInputRef} className="hidden-file-input" type="file" multiple onChange={handleFileChange}/>
                  <span className="composer-hint">Enter to send · Shift + Enter for new line</span>
                </div>
                <button className="send-button" disabled={(!input.trim() && attachments.length === 0) || busy || !cloudReady || !cloudState?.signedIn} onClick={() => void sendMessage()}>
                  {busy ? <LoaderCircle size={16} className="spin"/> : <Send size={15}/>}
                </button>
              </div>
            </div>
            <div className="composer-disclaimer"><ShieldCheck size={11}/> Your project context stays with Rmango. Studio edits only run after you approve them.</div>
          </div>
          </> : <AgentWorkspace
            projectId={cloudProjectId}
            projectName={appState?.projectPath ? appState.projectPath.split(/[\\/]/).filter(Boolean).pop() : undefined}
            conversationId={conversationId}
            profile={cloudProfile}
            onProfileChange={setCloudProfile}
            cloudReady={Boolean(cloudReady && cloudState?.signedIn)}
            studioConnected={studioConnected}
            onUploadProject={() => void handleUploadProject()}
            onReviewProposals={() => void handleLoadProjectChanges()}
            onNotify={setToast}
          />}
        </main>

        {rightPanelOpen && <aside className="right-sidebar">
          <div className="right-heading"><span>CONTROL ROOM</span><button className="subtle-icon" onClick={() => setRightPanelOpen(false)} title="Close inspector"><X size={15}/></button></div>

          <section className="inspector-section local-section">
            <div className="section-title">
              <span>RMANGO INTELLIGENCE</span>
              <span className={'live-indicator ' + (cloudReady ? 'live' : '')}>{cloudReady ? 'ONLINE' : cloudLoading ? 'CHECKING' : 'OFFLINE'}</span>
            </div>
            <div className="local-status-card">
              <div className="local-status-icon"><Sparkles size={19}/></div>
              <div className="local-status-copy">
                <strong>{cloudReady ? (cloudState?.signedIn ? 'Rmango is ready' : 'Cloud service is ready') : 'Cloud connection required'}</strong>
                <span>{cloudState?.signedIn ? 'Personal workspace connected' : (cloudState?.message || 'Hosted service not configured')}</span>
              </div>
              <span className={'status-dot ' + (cloudReady ? 'bright' : '')}/>
              <div className="local-meta"><span>INTELLIGENCE</span><strong>Rmango engine</strong><span>RUNTIME</span><strong>Hosted</strong></div>
            </div>
            {cloudState?.signedIn
              ? <button className="primary-action" onClick={() => setSettingsOpen(true)}><Settings2 size={13}/> Rmango Intelligence <ArrowRight size={13}/></button>
              : <button className="primary-action" onClick={() => setSettingsOpen(true)}><LockKeyhole size={13}/> Sign in to Rmango <ArrowRight size={13}/></button>}
            {cloudReady && <div className="connect-help">
              <strong>{currentProfile?.profileLabel || 'Rmango work modes'}</strong>
              <span>{'One assistant. The right work mode for the task.'}</span>
              {currentProfile && <span>{profileCopy[cloudProfile].tags.join(' · ')}</span>}
            </div>}
            {cloudState?.message && <div className="secure-note"><AlertCircle size={13}/><span>{cloudState.message}</span></div>}
          </section>

          <section className="inspector-section">
            <div className="section-title"><span>ROBLOX STUDIO MCP</span><span className={'live-indicator ' + (studioConnected ? 'live' : '')}>{studioConnected ? 'CONNECTED' : 'OFFLINE'}</span></div>
            <div className="studio-status-card">
              <div className={'studio-status-icon ' + (studioConnected ? 'live' : '')}><Gamepad2 size={19}/></div>
              <div className="studio-status-copy"><strong>{studioConnected ? (studioCloudLinked ? 'Studio linked to cloud' : 'Studio session linked') : 'Waiting for Studio'}</strong><span>{studioConnected ? (studioCloudLinked ? 'Secure cloud bridge active' : 'Local MCP connected · sign in to link cloud AI') : 'Enable Studio as MCP server'}</span></div>
              <span className={'status-dot ' + (studioConnected ? 'bright' : '')}/>
              <div className="studio-meta"><div><span>TOOLS</span><strong>{studioConnected ? studioTools.length : '—'}</strong></div><div><span>ACCESS</span><strong>Approval gated</strong></div><div><span>PLATFORM</span><strong>Windows</strong></div></div>
            </div>
            {studioConnected
              ? <button className="outline-action" onClick={() => void handleDisconnect()}><X size={13}/> Disconnect Studio</button>
              : <button className="primary-action" onClick={() => void handleConnect()} disabled={connecting}>{connecting ? <LoaderCircle size={14} className="spin"/> : <Link2 size={14}/>} Connect to Studio <ArrowRight size={13}/></button>}
            {!studioConnected && <div className="connect-help">
              <strong>Quick setup</strong>
              <span>In Roblox Studio: Assistant → Manage MCP Servers → turn on “Enable Studio as MCP server”. Keep Studio open, then connect here.</span>
              <button onClick={() => void window.rmango.openExternal('https://create.roblox.com/docs/studio/mcp')}>Official setup guide <ExternalLink size={11}/></button>
            </div>}
          </section>

          <section className="inspector-section">
            <div className="section-title"><span>AGENT TOOL ACCESS</span><span className="count-tag">{studioTools.length}</span></div>
            <div className="permission-legend"><span><i className="legend-read"/> Read-only</span><span><i className="legend-approve"/> Approval required</span></div>
            <div className="tool-stack">
              {studioConnected && studioTools.length
                ? studioTools.slice(0, 9).map(name => {
                    const needsApproval = [
                      'multi_edit','execute_luau','generate_mesh','generate_material','generate_texture',
                      'generate_procedural_model','generate_scene','generate_animation','generate_avatar',
                      'auto_setup_avatar','segment_mesh','insert_asset','upload_image','start_stop_play',
                      'character_navigation','user_keyboard_input','user_mouse_input','save_place',
                    ].includes(name);
                    return <div className="tool-item" key={name}><span className={'tool-icon ' + (needsApproval ? 'approve' : '')}><Wrench size={12}/></span><span>{name}</span><span className={'tool-read-tag ' + (needsApproval ? 'approve' : '')}>{needsApproval ? 'ASK' : 'READ'}</span></div>;
                  })
                : <div className="tools-empty"><Wrench size={17}/><span>Connect Studio to see available tools.</span></div>}
              {studioConnected && studioTools.length > 9 && <div className="more-tools">+ {studioTools.length - 9} more available</div>}
            </div>
          </section>

          <section className="inspector-section">
            <div className="section-title"><span>QUICK ACTIONS</span></div>
            <button className="quick-action-row" onClick={() => void handleDiagnostics()} disabled={!studioConnected || diagnosing}>
              <span className="action-icon"><Activity size={14}/></span><span><strong>Run Studio diagnostics</strong><small>Check session and place state</small></span>
              {diagnosing ? <LoaderCircle size={14} className="spin"/> : <ArrowRight size={13}/>}
            </button>
            <button className="quick-action-row" onClick={() => void sendMessage('Inspect the open Roblox place. Map the current DataModel, identify existing map and gameplay systems, then suggest the next high-impact improvement. Do not make changes before explaining the plan.')} disabled={!studioConnected || busy}>
              <span className="action-icon mango"><Search size={14}/></span><span><strong>Map my current place</strong><small>Inspect structure and layout</small></span><ArrowRight size={13}/>
            </button>
            <button className="quick-action-row" onClick={() => void sendMessage(quickPrompts[2].prompt)} disabled={!studioConnected || busy}>
              <span className="action-icon build"><Layers3 size={14}/></span><span><strong>Design a new map</strong><small>Plan it before generating</small></span><ArrowRight size={13}/>
            </button>
          </section>

          {diagnosticResult && <section className="inspector-section diagnostic-section">
            <div className="section-title"><span>DIAGNOSTIC OUTPUT</span><button className="subtle-icon" onClick={() => setDiagnosticResult('')}><X size={13}/></button></div>
            <pre>{diagnosticResult}</pre>
          </section>}
          <section className="inspector-section activity-section">
            <div className="section-title"><span>RECENT ACTIVITY</span><button className="subtle-icon" onClick={() => setActivities([])} title="Clear activity"><RefreshCw size={13}/></button></div>
            {activities.length
              ? activities.slice(-7).reverse().map((item, index) =>
                  <div className="activity-item" key={item.name + '-' + index}>
                    <span className={'activity-check ' + (item.ok ? 'ok' : 'bad')}>{item.ok ? <Check size={11}/> : <AlertCircle size={11}/>}</span>
                    <div><strong>{item.name}</strong><span>{item.detail}</span></div>
                  </div>
                )
              : <div className="activity-empty"><Activity size={15}/><span>RMango's tool calls and development activity appear here.</span></div>}
          </section>
          <div className="right-footer"><ShieldCheck size={13}/> Every Studio change requires your approval.</div>
        </aside>}
      </div>

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
          {pendingApproval.taskId && <div className="approval-task-ref">DURABLE TASK · {pendingApproval.taskId.slice(0, 8).toUpperCase()}</div>}
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

      {settingsOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
        <div className="settings-modal cloud-settings-modal">
          <div className="modal-header">
            <div>
              <div className="modal-kicker">RMANGO CLOUD PLATFORM</div>
              <h2>Rmango Intelligence</h2>
              <p>One Rmango assistant, built around Roblox development. Choose a work mode; Rmango handles the engine and routing.</p>
            </div>
            <button type="button" className="icon-button" onClick={() => setSettingsOpen(false)}><X size={17}/></button>
          </div>

          {!cloudState?.configured && <div className="local-setup-panel">
            <div className="local-setup-status"><AlertCircle size={14}/> Cloud backend not configured</div>
            <p>This build connects to Rmango's hosted intelligence service. Its server is not configured yet, and this version will not start Ollama or another local model as a fallback.</p>
          </div>}

          {cloudState?.configured && !cloudState.signedIn && <>
            <div className="field-label">RMANGO ACCOUNT</div>
            <div className="provider-options">
              <button type="button" className={'provider-option ' + (authMode === 'sign-in' ? 'selected' : '')} onClick={() => setAuthMode('sign-in')}>
                <span className="provider-symbol local-symbol"><LockKeyhole size={15}/></span><span><strong>Sign in</strong><small>Existing account</small></span>
              </button>
              <button type="button" className={'provider-option ' + (authMode === 'sign-up' ? 'selected' : '')} onClick={() => setAuthMode('sign-up')}>
                <span className="provider-symbol local-symbol"><Plus size={15}/></span><span><strong>Create account</strong><small>New Rmango account</small></span>
              </button>
            </div>
            <form onSubmit={handleAuth}>
              {authMode === 'sign-up' && <>
                <label className="field-label" htmlFor="rmango-display-name">DISPLAY NAME</label>
                <input id="rmango-display-name" className="settings-input" value={authDisplayName} onChange={event => setAuthDisplayName(event.target.value)} placeholder="Your name" maxLength={60}/>
              </>}
              <label className="field-label" htmlFor="rmango-email">EMAIL</label>
              <input id="rmango-email" className="settings-input" type="email" value={authEmail} onChange={event => setAuthEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required maxLength={254}/>
              <label className="field-label" htmlFor="rmango-password">PASSWORD</label>
              <input id="rmango-password" className="settings-input" type="password" value={authPassword} onChange={event => setAuthPassword(event.target.value)} placeholder={authMode === 'sign-up' ? 'At least 10 characters' : 'Your password'} autoComplete={authMode === 'sign-up' ? 'new-password' : 'current-password'} required minLength={authMode === 'sign-up' ? 10 : 1} maxLength={128}/>
              <div className="secure-note"><LockKeyhole size={13}/><span>Your Rmango account connects your private workspace, project context, and Studio tools. No separate AI-provider account is needed.</span></div>
              <div className="modal-footer">
                <button type="button" className="cancel-button" onClick={() => setSettingsOpen(false)}>Close</button>
                <button type="submit" className="save-button" disabled={authBusy || !authEmail.trim() || !authPassword}>
                  {authBusy ? <LoaderCircle size={14} className="spin"/> : <ArrowRight size={14}/>}
                  {authMode === 'sign-in' ? 'Sign in' : 'Create account'}
                </button>
              </div>
            </form>
          </>}

          {cloudState?.signedIn && <>
            <div className="account-card">
              <div className="account-avatar"><MangoMark size={27}/></div>
              <div className="account-copy"><strong>{cloudState.email || 'Rmango account'}</strong><span>{cloudState.serviceReady ? 'Cloud services online' : 'Account connected · backend setup required'}</span></div>
              <button type="button" className="cancel-button" onClick={() => void handleSignOut()}>Sign out</button>
            </div>

            <div className="field-label">RMANGO WORK MODES</div>
            <p className="settings-explainer">Choose the kind of work you need. The assistant keeps the same Rmango identity while adjusting how it plans, reasons, and uses tools.</p>
            {!cloudModels?.profiles.length
              ? <div className="tools-empty"><Cpu size={18}/><span>Rmango work modes are unavailable until its hosted intelligence service is configured.</span></div>
              : <div className="cloud-model-list">
                {cloudModels.profiles.map((profile: CloudModelProfile) =>
                  <button type="button" className={'cloud-model-card ' + (cloudProfile === profile.profile ? 'selected' : '')} key={profile.profile} onClick={() => setCloudProfile(profile.profile)}>
                    <span className="cloud-model-check">{cloudProfile === profile.profile ? <CheckCircle2 size={17}/> : <span/>}</span>
                    <span className="cloud-model-copy">
                      <strong>{profileCopy[profile.profile].title}</strong>
                      <small>RMANGO INTELLIGENCE</small>
                      <span>{profileCopy[profile.profile].description}</span>
                      <span className="cloud-capabilities">
                        {profileCopy[profile.profile].tags.map(tag => <i key={tag}>{tag}</i>)}
                      </span>
                    </span>
                  </button>
                )}
              </div>}
            <div className="secure-note"><ShieldCheck size={13}/><span>Profile labels are Rmango routing presets, not separate models trained by Rmango. Capability and price details come from the live Gateway catalogue. No benchmark scores are fabricated.</span></div>
          </>}

          <div className="modal-footer">
            <button type="button" className="cancel-button" onClick={() => setSettingsOpen(false)}>Close</button>
            {cloudState?.signedIn && <button type="button" className="save-button" onClick={() => void refreshCloudState()}><RefreshCw size={13}/> Refresh cloud status</button>}
          </div>
        </div>
      </div>}

      {toast && <div className="toast"><CheckCircle2 size={15}/>{toast}</div>}
    </div>
  );
}

export default App;
