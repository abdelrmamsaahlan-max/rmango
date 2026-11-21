import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertCircle, ArrowDown, ArrowRight, Bot, Box, Check, CheckCircle2,
  ChevronDown, ChevronRight, CircleHelp, Code2, Command, Cpu, ExternalLink,
  FileCode2, FileJson, FileText, Folder, FolderOpen, Gauge, Gamepad2, GitBranch,
  HardDrive, History, Layers3, Link2, LoaderCircle, LockKeyhole, Menu, MessageSquare,
  MoreHorizontal, Play, Plus, RefreshCw, Search, Send, Settings2, ShieldCheck,
  Sparkles, Square, Terminal, Wrench, X, Zap
} from 'lucide-react';
import type { AppState, ChatMessage, ProjectFile, Settings } from './types';

type ActivityItem = { name: string; detail: string; ok: boolean };

const timeNow = () => new Date().toISOString();
const displayTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function IconForFile({ file }: { file: ProjectFile }) {
  if (file.kind === 'folder') return <Folder size={14} className="file-icon folder-icon" />;
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (['lua', 'luau'].includes(ext || '')) return <FileCode2 size={14} className="file-icon lua-icon" />;
  if (ext === 'json') return <FileJson size={14} className="file-icon json-icon" />;
  return <FileText size={14} className="file-icon" />;
}

function App() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [studioTools, setStudioTools] = useState<string[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [diagnosticResult, setDiagnosticResult] = useState<string>('');
  const [provider, setProvider] = useState<'anthropic' | 'openai'>('anthropic');
  const [model, setModel] = useState('claude-fable-5-2');
  const [apiKey, setApiKey] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [search, setSearch] = useState('');
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    Promise.all([window.rmango.getAppState(), window.rmango.getSettings(), window.rmango.loadMessages()])
      .then(([state, savedSettings, savedMessages]) => {
        setAppState(state);
        setProjectFiles(state.projectFiles || []);
        setSettings(savedSettings);
        setProvider(savedSettings.provider);
        setModel(savedSettings.model);
        setMessages(savedMessages || []);
        if (state.projectPath) {
          // The persisted path is reflected in the workspace; the file tree refreshes when the user reopens it.
        }
        if (state.studioConnected) void refreshMcpState();
      })
      .catch(() => setToast('Could not read local app state. Restart Rmango and try again.'));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  useEffect(() => {
    if (messages.length) void window.rmango.saveMessages(messages);
  }, [messages]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 3600);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function refreshMcpState() {
    const state = await window.rmango.getMcpState();
    setStudioTools(state.tools || []);
    setAppState(prev => prev ? { ...prev, studioConnected: state.connected, studioToolCount: state.toolCount } : prev);
  }

  async function handleConnect() {
    setConnecting(true);
    try {
      const result = await window.rmango.connectRoblox();
      if (result.ok) {
        await refreshMcpState();
        setToast(`Connected to Roblox Studio · ${result.toolCount} tools discovered`);
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
      const report = (result.checks || []).map((check: any) => `${check.ok ? '✓' : '×'} ${check.name}\n${check.detail}`).join('\n\n');
      setDiagnosticResult(report || result.error || 'No diagnostic tools were available.');
      setActivities((result.checks || []).map((check: any) => ({ name: check.name, detail: check.ok ? 'Studio diagnostic completed' : check.detail, ok: check.ok })));
      setToast(result.ok ? 'Studio diagnostics completed.' : 'Diagnostics completed with warnings.');
    } catch (error) {
      setDiagnosticResult(error instanceof Error ? error.message : String(error));
    } finally {
      setDiagnosing(false);
    }
  }

  async function handleSaveSettings(event: FormEvent) {
    event.preventDefault();
    setSavingSettings(true);
    try {
      const result = await window.rmango.saveSettings({ provider, model, apiKey: apiKey.trim() || undefined });
      const next = await window.rmango.getSettings();
      setSettings(next);
      setApiKey('');
      setSettingsOpen(false);
      setToast(result.message || (result.keySaved ? 'AI settings saved securely.' : 'Model settings saved.'));
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not save settings.');
    } finally {
      setSavingSettings(false);
    }
  }

  async function sendMessage(content = input) {
    const trimmed = content.trim();
    if (!trimmed || busy) return;
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: trimmed, createdAt: timeNow() }];
    setMessages(nextMessages);
    setInput('');
    setBusy(true);
    try {
      const result = await window.rmango.sendMessage({ messages: nextMessages.map(({ role, content: text }) => ({ role, content: text })), mode: 'agent' });
      setActivities(result.activity || []);
      setMessages(current => [...current, { role: 'assistant', content: result.content, createdAt: timeNow() }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong while contacting the model.';
      setMessages(current => [...current, { role: 'assistant', content: `I couldn't complete that request.\n\n${message}`, createdAt: timeNow() }]);
    } finally {
      setBusy(false);
      composerRef.current?.focus();
    }
  }

  function handleComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  const filteredFiles = useMemo(() => {
    if (!search.trim()) return projectFiles;
    const q = search.toLowerCase();
    return projectFiles.filter(file => file.name.toLowerCase().includes(q));
  }, [projectFiles, search]);

  const providerLabel = settings?.provider === 'openai' ? 'OpenAI' : 'Anthropic';
  const modelLabel = settings?.model || 'No model selected';
  const studioConnected = appState?.studioConnected ?? false;

  const quickPrompts = [
    { icon: <Search size={14}/>, label: 'Inspect my game', prompt: 'Inspect my currently open Roblox game. Start by checking the connected Studio instance and state, then summarize the project structure and the most important systems you can identify. Do not make changes.' },
    { icon: <Code2 size={14}/>, label: 'Review my scripts', prompt: 'Review the scripts in my open Roblox Studio project. Search for important scripts, inspect the main game systems, and report architecture risks, bugs, and the highest-impact improvements. Do not edit anything.' },
    { icon: <Layers3 size={14}/>, label: 'Plan a game system', prompt: 'Help me design a production-ready Roblox game system. Ask what game and system I am building if it is not clear, then give me a modular implementation plan with server/client responsibilities and test cases.' },
  ];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand-mark"><span>R</span><i /></div>
          <span className="brand-name">rmango</span>
          <span className="brand-beta">EARLY ACCESS</span>
        </div>
        <div className="topbar-divider" />
        <div className="workspace-crumb"><Gamepad2 size={15}/><span>Roblox workspace</span><ChevronDown size={13}/></div>
        <div className="topbar-spacer" />
        <div className={`connection-pill ${studioConnected ? 'connected' : ''}`}>
          <span className="status-dot" />
          {studioConnected ? 'Studio connected' : 'Studio offline'}
        </div>
        <button className="icon-button top-icon" title="Help" onClick={() => void window.rmango.openExternal('https://create.roblox.com/docs/studio/mcp')}><CircleHelp size={17}/></button>
        <button className="top-settings" onClick={() => setSettingsOpen(true)}><Settings2 size={15}/> Settings</button>
        <div className="avatar">R</div>
      </header>

      <div className="workspace-layout">
        <nav className="activity-rail">
          <button className="rail-button active" title="Workspace"><Layers3 size={18}/></button>
          <button className="rail-button" title="AI chat" onClick={() => composerRef.current?.focus()}><MessageSquare size={18}/></button>
          <button className="rail-button" title="Tools" onClick={() => setRightPanelOpen(true)}><Wrench size={18}/></button>
          <div className="rail-spacer" />
          <button className="rail-button" title="Settings" onClick={() => setSettingsOpen(true)}><Settings2 size={18}/></button>
        </nav>

        <aside className="left-sidebar">
          <div className="sidebar-heading"><span>WORKSPACE</span><button className="subtle-icon" title="More"><MoreHorizontal size={16}/></button></div>
          <div className="project-card">
            <div className="project-icon"><Gamepad2 size={17}/></div>
            <div className="project-details"><strong>{appState?.projectPath ? appState.projectPath.split(/[\\/]/).filter(Boolean).pop() : 'No project open'}</strong><span>{appState?.projectPath ? 'Local project folder' : 'Choose a folder to begin'}</span></div>
            <button className="subtle-icon" title="Open project folder" onClick={() => void handleOpenProject()}><FolderOpen size={15}/></button>
          </div>
          <div className="section-row"><span>PROJECT EXPLORER</span><button className="subtle-icon" onClick={() => void handleOpenProject()} title="Open folder"><Plus size={14}/></button></div>
          {appState?.projectPath ? <div className="project-path" title={appState.projectPath}>{appState.projectPath}</div> : <div className="empty-explorer"><FolderOpen size={21}/><span>No project folder selected</span><button onClick={() => void handleOpenProject()}>Open folder</button></div>}
          {projectFiles.length > 0 && <>
            <div className="file-search"><Search size={13}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter files" /></div>
            <div className="file-tree">
              {filteredFiles.slice(0, 70).map((file, index) => <div className={`file-row ${file.kind === 'folder' ? 'folder-row' : ''}`} key={`${file.path}-${index}`}><IconForFile file={file}/><span>{file.name}</span></div>)}
              {filteredFiles.length === 0 && <div className="small-empty">No matching files</div>}
            </div>
          </>}
          <div className="sidebar-bottom">
            <div className="section-row"><span>CONNECTIONS</span><span className={`tiny-status ${studioConnected ? 'on' : ''}`}/></div>
            <div className="integration-row"><div className="integration-icon roblox"><Gamepad2 size={14}/></div><div><strong>Roblox Studio</strong><span>{studioConnected ? `${studioTools.length} read tools ready` : 'Not connected'}</span></div><button className="subtle-icon" title={studioConnected ? 'Disconnect' : 'Connect'} onClick={() => studioConnected ? void handleDisconnect() : void handleConnect()}>{studioConnected ? <Check size={14}/> : <Link2 size={14}/>}</button></div>
            <div className="integration-row"><div className="integration-icon blender"><Box size={14}/></div><div><strong>Blender</strong><span>Coming in a later build</span></div><span className="soon-tag">SOON</span></div>
          </div>
        </aside>

        <main className="main-panel">
          <div className="main-toolbar">
            <div className="tab-active"><MessageSquare size={14}/> Agent chat <span className="tab-close">×</span></div>
            <div className="toolbar-actions"><span className="model-chip"><Sparkles size={12}/>{modelLabel}</span><button className="subtle-icon" title="Toggle activity panel" onClick={() => setRightPanelOpen(v => !v)}><Menu size={16}/></button></div>
          </div>
          <div className="chat-scroll">
            <div className="chat-content">
              {messages.length === 0 ? <div className="welcome-block">
                <div className="welcome-orb"><div className="brand-mark large"><span>R</span><i /></div><div className="orb-spark spark-one"/><div className="orb-spark spark-two"/><div className="orb-spark spark-three"/></div>
                <div className="welcome-eyebrow"><span className="eyebrow-line"/> YOUR ROBLOX DEVELOPMENT AGENT <span className="eyebrow-line"/></div>
                <h1>What are we <em>building</em><br/>today?</h1>
                <p>Tell Rmango what you want to create. I can inspect your connected Studio session, understand your scripts, and help architect your next game feature.</p>
                <div className="quick-grid">
                  {quickPrompts.map(item => <button className="quick-card" key={item.label} onClick={() => void sendMessage(item.prompt)}><span className="quick-icon">{item.icon}</span><span>{item.label}</span><ArrowRight size={14} className="quick-arrow"/></button>)}
                </div>
                {!settings?.keyConfigured && <button className="setup-nudge" onClick={() => setSettingsOpen(true)}><LockKeyhole size={14}/> Add an AI API key in Settings to start chatting <ArrowRight size={13}/></button>}
              </div> : <div className="message-list">
                {messages.map((message, index) => <div className={`message-row ${message.role}`} key={`${message.createdAt}-${index}`}>
                  <div className={`message-avatar ${message.role}`}>{message.role === 'assistant' ? <div className="mini-mark">R</div> : 'Y'}</div>
                  <div className="message-body">
                    <div className="message-meta"><strong>{message.role === 'assistant' ? 'Rmango' : 'You'}</strong><span>{displayTime(message.createdAt)}</span>{message.role === 'assistant' && <span className="agent-tag"><Sparkles size={10}/> AGENT</span>}</div>
                    <div className="message-content">{message.content}</div>
                  </div>
                </div>)}
                {busy && <div className="message-row assistant"><div className="message-avatar assistant"><div className="mini-mark">R</div></div><div className="message-body"><div className="message-meta"><strong>Rmango</strong><span>working</span></div><div className="thinking-state"><span className="typing-dots"><i/><i/><i/></span><span>Thinking through your request</span></div></div></div>}
                <div ref={bottomRef}/>
              </div>}
            </div>
          </div>
          <div className="composer-area">
            <div className="composer-box">
              <textarea ref={composerRef} rows={2} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleComposerKey} placeholder="Ask Rmango to inspect, plan, or improve your Roblox game..." />
              <div className="composer-footer"><div className="composer-left"><span className="read-only-badge"><ShieldCheck size={11}/> READ-ONLY STUDIO ACCESS</span><span className="composer-hint">Enter to send · Shift + Enter for new line</span></div><button className="send-button" disabled={!input.trim() || busy} onClick={() => void sendMessage()}>{busy ? <LoaderCircle size={16} className="spin"/> : <Send size={15}/>}</button></div>
            </div>
            <div className="composer-disclaimer">Rmango can make mistakes. Review important code and changes before using them in your game.</div>
          </div>
        </main>

        {rightPanelOpen && <aside className="right-sidebar">
          <div className="right-heading"><span>INSPECTOR</span><button className="subtle-icon" onClick={() => setRightPanelOpen(false)} title="Close inspector"><X size={15}/></button></div>
          <section className="inspector-section">
            <div className="section-title"><span>STUDIO SESSION</span><span className={`live-indicator ${studioConnected ? 'live' : ''}`}>{studioConnected ? 'LIVE' : 'OFFLINE'}</span></div>
            <div className="studio-status-card">
              <div className={`studio-status-icon ${studioConnected ? 'live' : ''}`}><Gamepad2 size={19}/></div>
              <div className="studio-status-copy"><strong>{studioConnected ? 'Roblox Studio detected' : 'Waiting for Studio'}</strong><span>{studioConnected ? 'MCP connection established' : 'Connect your active Studio session'}</span></div>
              <span className={`status-dot ${studioConnected ? 'bright' : ''}`}/>
              <div className="studio-meta"><div><span>TOOLS</span><strong>{studioConnected ? studioTools.length : '—'}</strong></div><div><span>ACCESS</span><strong>Read only</strong></div><div><span>PLATFORM</span><strong>Windows</strong></div></div>
            </div>
            {studioConnected ? <button className="outline-action" onClick={() => void handleDisconnect()}><X size={13}/> Disconnect Studio</button> : <button className="primary-action" onClick={() => void handleConnect()} disabled={connecting}>{connecting ? <LoaderCircle size={14} className="spin"/> : <Link2 size={14}/>} Connect to Studio <ArrowRight size={13}/></button>}
            {!studioConnected && <div className="connect-help"><strong>Quick setup</strong><span>In Roblox Studio, open Assistant → Manage MCP Servers and enable “Studio as MCP server”. Then connect here.</span><button onClick={() => void window.rmango.openExternal('https://create.roblox.com/docs/studio/mcp')}>View setup guide <ExternalLink size={11}/></button></div>}
          </section>
          <section className="inspector-section">
            <div className="section-title"><span>AGENT TOOLS</span><span className="count-tag">{studioTools.length}</span></div>
            <div className="tool-stack">
              {studioConnected && studioTools.length ? studioTools.slice(0, 8).map(name => <div className="tool-item" key={name}><span className="tool-icon"><Wrench size={12}/></span><span>{name}</span><span className="tool-read-tag">READ</span></div>) : <div className="tools-empty"><Wrench size={17}/><span>Studio tools will appear here after connecting.</span></div>}
              {studioConnected && studioTools.length > 8 && <div className="more-tools">+ {studioTools.length - 8} more available</div>}
            </div>
          </section>
          <section className="inspector-section">
            <div className="section-title"><span>QUICK ACTIONS</span></div>
            <button className="quick-action-row" onClick={() => void handleDiagnostics()} disabled={!studioConnected || diagnosing}><span className="action-icon"><Activity size={14}/></span><span><strong>Run Studio diagnostics</strong><small>Check session and DataModel state</small></span>{diagnosing ? <LoaderCircle size={14} className="spin"/> : <ArrowRight size={13}/>}</button>
            <button className="quick-action-row" onClick={() => void sendMessage('Inspect the currently connected Roblox Studio session. Identify the open experience and summarize its state, available scripts, and important warnings. Do not make changes.')} disabled={!studioConnected || busy}><span className="action-icon purple"><Search size={14}/></span><span><strong>Inspect open experience</strong><small>Ask the agent to map the project</small></span><ArrowRight size={13}/></button>
          </section>
          {diagnosticResult && <section className="inspector-section diagnostic-section"><div className="section-title"><span>DIAGNOSTIC OUTPUT</span><button className="subtle-icon" onClick={() => setDiagnosticResult('')}><X size={13}/></button></div><pre>{diagnosticResult}</pre></section>}
          <section className="inspector-section activity-section">
            <div className="section-title"><span>RECENT ACTIVITY</span><button className="subtle-icon" onClick={() => setActivities([])} title="Clear activity"><RefreshCw size={13}/></button></div>
            {activities.length ? activities.slice(-6).reverse().map((item, index) => <div className="activity-item" key={`${item.name}-${index}`}><span className={`activity-check ${item.ok ? 'ok' : 'bad'}`}>{item.ok ? <Check size={11}/> : <AlertCircle size={11}/>}</span><div><strong>{item.name}</strong><span>{item.detail}</span></div></div>) : <div className="activity-empty"><History size={15}/><span>Agent actions will show up here.</span></div>}
          </section>
          <div className="right-footer"><ShieldCheck size={13}/> No Studio edits are enabled in this MVP.</div>
        </aside>}
      </div>

      {settingsOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSettingsOpen(false); }}>
        <form className="settings-modal" onSubmit={handleSaveSettings}>
          <div className="modal-header"><div><div className="modal-kicker">RMANGO CONFIGURATION</div><h2>AI provider settings</h2><p>Connect your own model API key. It stays on this computer.</p></div><button type="button" className="icon-button" onClick={() => setSettingsOpen(false)}><X size={17}/></button></div>
          <label className="field-label">PROVIDER</label>
          <div className="provider-options">
            <button type="button" className={`provider-option ${provider === 'anthropic' ? 'selected' : ''}`} onClick={() => { setProvider('anthropic'); if (model.startsWith('gpt-')) setModel('claude-fable-5-2'); }}><span className="provider-symbol anthropic-symbol">A</span><span><strong>Anthropic</strong><small>Claude Fable 5.2</small></span>{provider === 'anthropic' && <CheckCircle2 size={15}/>}</button>
            <button type="button" className={`provider-option ${provider === 'openai' ? 'selected' : ''}`} onClick={() => { setProvider('openai'); if (model.startsWith('claude-')) setModel('gpt-6.2-astra'); }}><span className="provider-symbol openai-symbol">◉</span><span><strong>OpenAI</strong><small>GPT-6.2 Astra and more</small></span>{provider === 'openai' && <CheckCircle2 size={15}/>}</button>
          </div>
          <label className="field-label" htmlFor="model-id">MODEL ID</label>
          <input id="model-id" className="settings-input" list="rmango-model-options" value={model} onChange={e => setModel(e.target.value)} placeholder={provider === 'anthropic' ? 'claude-fable-5-2' : 'gpt-6.2-astra'} required />
          <datalist id="rmango-model-options">
            {provider === 'anthropic' ? <><option value="claude-fable-5-2"/><option value="claude-opus-5-5"/><option value="claude-sonnet-5-5"/><option value="claude-haiku-5-5"/></> : <><option value="gpt-6.2-astra"/><option value="gpt-6.2-sol"/><option value="gpt-6-luna"/><option value="gpt-6.1-terra"/></>}
          </datalist>
          <div className="provider-footnote">Use a model ID enabled for your API account. Suggested models are listed as you type.</div>
          <label className="field-label" htmlFor="api-key">API KEY {(settings?.configuredProviders?.includes(provider) || (settings?.keyConfigured && settings.provider === provider)) && <span className="configured-label"><Check size={10}/> KEY SAVED</span>}</label>
          <input id="api-key" className="settings-input" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={(settings?.configuredProviders?.includes(provider) || (settings?.keyConfigured && settings.provider === provider)) ? 'Saved securely · enter a new key to replace' : 'Paste your provider API key'} autoComplete="off" />
          <div className="secure-note"><LockKeyhole size={13}/><span>{settings?.secureStorageAvailable ? 'Encrypted using Windows secure storage. Your key is never sent to Rmango servers.' : 'Secure OS storage is unavailable. A newly entered key is kept only for this app session.'}</span></div>
          <div className="modal-footer"><button type="button" className="cancel-button" onClick={() => setSettingsOpen(false)}>Cancel</button><button type="submit" className="save-button" disabled={savingSettings || !model.trim()}>{savingSettings ? <LoaderCircle size={14} className="spin"/> : <Check size={14}/>} Save settings</button></div>
          <div className="provider-footnote">API usage is billed by your selected provider. Rmango does not include model credits.</div>
        </form>
      </div>}

      {toast && <div className="toast"><CheckCircle2 size={15}/>{toast}</div>}
    </div>
  );
}

export default App;
