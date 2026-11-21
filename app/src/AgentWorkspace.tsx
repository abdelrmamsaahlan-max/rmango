import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Activity, AlertCircle, ArrowUpRight, BrainCircuit, CheckCircle2, Clock3,
  Code2, Layers3, LoaderCircle, Pause, Play, RefreshCw, RotateCcw, Send,
  ShieldCheck, Sparkles, Square, ThumbsDown, ThumbsUp, Workflow, Wrench,
} from "lucide-react";
import type {
  AgentTask, AgentTaskDetail, AgentTaskEvent, CloudProfile, ProjectIndexStatus,
} from "./types";
import "./AgentWorkspace.css";

type Props = {
  projectId?: string;
  projectName?: string;
  conversationId?: string;
  profile: CloudProfile;
  onProfileChange: (profile: CloudProfile) => void;
  cloudReady: boolean;
  studioConnected: boolean;
  onUploadProject: () => void;
  onReviewProposals: () => void;
  onNotify: (message: string) => void;
};

const timeLabel = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const dateLabel = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString([], { month: "short", day: "numeric" }) + " · " + timeLabel(value);
};

const statusLabels: Record<string, string> = {
  queued: "Queued",
  running: "Working",
  waiting_approval: "Needs approval",
  paused: "Paused",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

function EventIcon({ type }: { type: string }) {
  if (/failed|error|timeout/i.test(type)) return <AlertCircle size={13} />;
  if (/completed|approved|result_ready/i.test(type)) return <CheckCircle2 size={13} />;
  if (/tool|studio/i.test(type)) return <Wrench size={13} />;
  if (/plan|index|verification/i.test(type)) return <Layers3 size={13} />;
  if (/approval/i.test(type)) return <ShieldCheck size={13} />;
  return <Activity size={13} />;
}

function TaskStatus({ status }: { status: string }) {
  const style = status === "completed" ? "success"
    : status === "failed" || status === "cancelled" ? "danger"
    : status === "waiting_approval" ? "approval"
    : status === "paused" ? "muted"
    : "active";
  return <span className={"agent-status " + style}><i />{statusLabels[status] || status}</span>;
}

function eventMeta(event: AgentTaskEvent) {
  const data = event.data || {};
  const parts: string[] = [];
  if (typeof data.toolName === "string") parts.push(data.toolName);

  if (typeof data.stepNumber === "number") parts.push("Step " + (data.stepNumber + 1));
  if (typeof data.durationMs === "number") parts.push((data.durationMs / 1000).toFixed(1) + "s");
  if (data.successful === false) parts.push("Failed");
  return parts.join(" · ");
}

export function AgentWorkspace({
  projectId,
  projectName,
  conversationId,
  profile,
  onProfileChange,
  cloudReady,
  studioConnected,
  onUploadProject,
  onReviewProposals,
  onNotify,
}: Props) {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgentTaskDetail | null>(null);
  const [indexInfo, setIndexInfo] = useState<ProjectIndexStatus | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [acting, setActing] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [eventFilter, setEventFilter] = useState<"all" | "tools" | "errors">("all");
  const listInFlight = useRef(false);
  const detailInFlight = useRef(false);

  const selectedTask = (detail?.task.id === selectedId ? detail.task : null) || tasks.find(task => task.id === selectedId) || null;
  const taskResult = (selectedTask?.result || {}) as Record<string, any>;
  const verification = taskResult.verification as Record<string, any> | undefined;
  const events = useMemo(() => {
    const all = detail?.events || [];
    if (eventFilter === "tools") return all.filter(event => /tool|studio|approval/i.test(event.event_type));
    if (eventFilter === "errors") return all.filter(event => /failed|error|timeout/i.test(event.event_type));
    return all;
  }, [detail?.events, eventFilter]);

  async function refreshTasks() {
    if (!cloudReady || !projectId || listInFlight.current) return;
    listInFlight.current = true;
    try {
      const response = await window.rmango.getAgentTasks(projectId);
      const nextTasks = response.tasks || [];
      setTasks(nextTasks);
      setSelectedId(current => {
        if (current && nextTasks.some(task => task.id === current)) return current;
        const active = nextTasks.find(task => ["running", "queued", "waiting_approval", "paused"].includes(task.status));
        return active?.id || nextTasks[0]?.id || null;
      });
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not load saved agent tasks.");
    } finally {
      listInFlight.current = false;
      setLoading(false);
    }
  }

  async function refreshIndex() {
    if (!cloudReady || !projectId) {
      setIndexInfo(null);
      return;
    }
    try {
      setIndexInfo(await window.rmango.getCloudProjectIndex(projectId));
    } catch {
      setIndexInfo(null);
    }
  }

  useEffect(() => {
    setTasks([]);
    setDetail(null);
    setSelectedId(null);
    setIndexInfo(null);
    setLoading(true);
    void refreshTasks();
    void refreshIndex();
    const listTimer = window.setInterval(() => void refreshTasks(), 6_000);
    const indexTimer = window.setInterval(() => void refreshIndex(), 12_000);
    return () => {
      window.clearInterval(listTimer);
      window.clearInterval(indexTimer);
    };
  }, [projectId, cloudReady]);

  useEffect(() => {
    if (!selectedId || !cloudReady) {
      setDetail(null);
      return;
    }
    let disposed = false;
    const refresh = async () => {
      if (detailInFlight.current) return;
      detailInFlight.current = true;
      try {
        const next = await window.rmango.getAgentTask(selectedId);
        if (!disposed) setDetail(next);
      } catch (error) {
        if (!disposed) onNotify(error instanceof Error ? error.message : "Could not refresh this task.");
      } finally {
        detailInFlight.current = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1_800);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [selectedId, cloudReady]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!projectId) {
      onNotify("Upload a Roblox project to Rmango Cloud before starting a durable agent task.");
      return;
    }
    if (!cloudReady) {
      onNotify("RMango could not start your guest workspace. Retry the service connection.");
      return;
    }
    if (draft.trim().length < 8) return;
    setSubmitting(true);
    try {
      const response = await window.rmango.createAgentTask({
        projectId,
        conversationId,
        taskText: draft.trim(),
        profile,
      });
      setDraft("");
      setSelectedId(response.task.id);
      await refreshTasks();
      onNotify("Agent task queued. Its progress is saved to your private RMango workspace.");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not create the agent task.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAction(action: "pause" | "resume" | "cancel" | "retry") {
    if (!selectedTask || acting) return;
    setActing(true);
    try {
      await window.rmango.controlAgentTask({ taskId: selectedTask.id, action });
      await Promise.all([refreshTasks(), refreshIndex()]);
      const next = await window.rmango.getAgentTask(selectedTask.id);
      setDetail(next);
      onNotify(action === "resume" ? "Task resumed from its saved checkpoint."
        : action === "retry" ? "A new attempt has been queued."
        : action === "pause" ? "Task paused. Pending Studio commands were stopped."
        : "Task cancelled.");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not update this agent task.");
    } finally {
      setActing(false);
    }
  }

  async function handleIndex() {
    if (!projectId || indexing || !cloudReady) return;
    setIndexing(true);
    try {
      await window.rmango.startCloudProjectIndex(projectId);
      await refreshIndex();
      onNotify("Project indexing started. Rmango will refresh the source and dependency map.");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not start project indexing.");
    } finally {
      setIndexing(false);
    }
  }

  async function handleFeedback(helpful: boolean) {
    if (!selectedTask || selectedTask.status !== "completed" || feedbackBusy) return;
    setFeedbackBusy(true);
    try {
      const result = await window.rmango.submitAgentFeedback({ taskId: selectedTask.id, helpful });
      setDetail(current => current && current.task.id === selectedTask.id
        ? { ...current, feedback: result.feedback }
        : current);
      onNotify("Feedback saved. RMango uses ratings and verified outcomes to improve future project guidance.");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Could not save task feedback.");
    } finally {
      setFeedbackBusy(false);
    }
  }

  const status = selectedTask?.status || "";
  const canPause = status === "running" || status === "queued" || status === "waiting_approval";
  const canResume = status === "paused";
  const canRetry = status === "failed";
  const canCancel = ["queued", "running", "paused", "waiting_approval"].includes(status);
  const index = indexInfo?.index;
  const latestIndex = index?.latestRun;

  return (
    <section className="agent-workspace">
      <div className="agent-workspace-top">
        <div className="agent-workspace-heading">
          <div className="agent-workspace-mark"><span><Sparkles size={17} /></span></div>
          <div>
            <div className="agent-eyebrow">RMANGO AGENT</div>
            <h2>Agent workspace</h2>
            <p>{projectName ? "Working in " + projectName : "Persistent Roblox development tasks"}</p>
          </div>
        </div>
        <div className="agent-workspace-connectivity">
          <span className={cloudReady ? "is-on" : ""}><i /> Cloud {cloudReady ? "ready" : "offline"}</span>
          <span className={studioConnected ? "is-on" : ""}><i /> Studio {studioConnected ? "connected" : "disconnected"}</span>
        </div>
      </div>

      {!projectId ? (
        <div className="agent-project-empty">
          <div className="agent-empty-icon"><Layers3 size={22} /></div>
          <h3>Connect a Roblox project</h3>
          <p>Upload your local source project to create durable tasks, build a dependency index, and let Rmango compare source files with your live Studio place.</p>
          <button onClick={onUploadProject} disabled={!cloudReady}><RefreshCw size={14} /> Upload project to Cloud</button>
        </div>
      ) : (
        <>
          <form className="agent-task-composer" onSubmit={handleSubmit}>
            <div className="agent-composer-title">
              <span><BrainCircuit size={15} /> New development task</span>
              <span className="agent-composer-hint">Understand · plan · build · verify</span>
            </div>
            <textarea
              value={draft}
              onChange={event => setDraft(event.target.value)}
              placeholder="Describe a complete Roblox development task. Example: inspect how player data, inventory and rewards connect; fix the save flow, update every affected script, then playtest the main user journey and inspect console errors…"
              rows={3}
              maxLength={12_000}
              disabled={!cloudReady || submitting}
            />
            <div className="agent-composer-footer">
              <div className="agent-composer-selectors">
                <select value={profile} onChange={event => onProfileChange(event.target.value as CloudProfile)} disabled={submitting || !cloudReady}>
                  <option value="agent">Agent</option>
                  <option value="developer">Build</option>
                  <option value="think">Deep Think</option>
                  <option value="fast">Quick</option>
                  <option value="vision">Vision</option>
                </select>
                <span><ShieldCheck size={12} /> Studio edits require approval</span>
              </div>
              <button className="agent-create-button" type="submit" disabled={!cloudReady || !draft.trim() || draft.trim().length < 8 || submitting}>
                {submitting ? <LoaderCircle size={15} className="spin" /> : <Send size={14} />}
                Start task
              </button>
            </div>
          </form>

          <div className="agent-index-strip">
            <div className="agent-index-icon"><Layers3 size={15} /></div>
            <div className="agent-index-copy">
              <strong>Project intelligence</strong>
              <span>{index
                ? index.indexedCount + "/" + index.fileCount + " files indexed · " + index.dependencyCount + " dependency edges · " + index.symbolCount + " symbols"
                : "Index your uploaded source files and Luau relationships"}</span>
            </div>
            {latestIndex && <span className={"agent-index-status " + latestIndex.status}>{latestIndex.status}</span>}
            <button onClick={() => void handleIndex()} disabled={!cloudReady || indexing || latestIndex?.status === "running"}>
              {indexing || latestIndex?.status === "running" ? <LoaderCircle size={13} className="spin" /> : <RefreshCw size={13} />}
              {latestIndex?.status === "running" ? "Indexing" : "Re-index"}
            </button>
          </div>

          <div className="agent-workspace-grid">
            <aside className="agent-task-list">
              <div className="agent-list-header"><span>YOUR TASKS</span><span>{tasks.length}</span></div>
              {loading ? (
                <div className="agent-list-empty"><LoaderCircle size={15} className="spin" /> Loading saved tasks…</div>
              ) : tasks.length === 0 ? (
                <div className="agent-list-empty"><Workflow size={18} /><span>Your work stays saved here. Pick up any task where you left it.</span></div>
              ) : (
                <div className="agent-task-list-scroll">
                  {tasks.map(task => (
                    <button className={"agent-task-row " + (task.id === selectedId ? "selected" : "")} key={task.id} onClick={() => setSelectedId(task.id)}>
                      <div className="agent-task-row-top"><TaskStatus status={task.status} /><time>{dateLabel(task.created_at)}</time></div>
                      <strong>{task.task_text}</strong>
                      <span>{String(task.result?.stage || "queued").replace(/_/g, " ") + " · " + (task.workflow_run_id ? "durable run" : "saved task")}</span>
                    </button>
                  ))}
                </div>
              )}
            </aside>

            <main className="agent-task-detail">
              {!selectedTask ? (
                <div className="agent-detail-empty">
                  <div className="agent-empty-icon"><Workflow size={22} /></div>
                  <h3>Choose a task or start a new one</h3>
                  <p>Plan, tool activity, checkpoints and test evidence will appear in this workspace.</p>
                </div>
              ) : (
                <>
                  <div className="agent-detail-header">
                    <div>
                      <div className="agent-detail-kicker">TASK {selectedTask.id.slice(0, 8).toUpperCase()}</div>
                      <h3>{selectedTask.task_text}</h3>
                      <div className="agent-detail-meta">
                        <TaskStatus status={selectedTask.status} />
                        <span><Clock3 size={11} /> Updated {timeLabel(selectedTask.updated_at)}</span>
                        <span><Sparkles size={11} /> {String(taskResult.modelProfile || profile).toUpperCase()}</span>
                      </div>
                    </div>
                    <div className="agent-task-actions">
                      {canPause && <button title="Pause task" onClick={() => void handleAction("pause")} disabled={acting}><Pause size={14} /></button>}
                      {canResume && <button title="Resume task" onClick={() => void handleAction("resume")} disabled={acting}><Play size={14} /></button>}
                      {canRetry && <button title="Retry task" onClick={() => void handleAction("retry")} disabled={acting}><RotateCcw size={14} /></button>}
                      {canCancel && <button title="Cancel task" onClick={() => void handleAction("cancel")} disabled={acting}><Square size={13} /></button>}
                      {acting && <LoaderCircle size={14} className="spin" />}
                    </div>
                  </div>

                  {selectedTask.status === "waiting_approval" && (
                    <div className="agent-approval-banner">
                      <ShieldCheck size={15} />
                      <div><strong>Studio approval required</strong><span>Review the approval prompt in the RMango desktop app. The durable agent is waiting for the local decision.</span></div>
                    </div>
                  )}
                  {selectedTask.error && <div className="agent-error-banner"><AlertCircle size={14} /><span>{selectedTask.error}</span></div>}

                  <div className="agent-result-grid">
                    <section className="agent-result-card">
                      <div className="agent-section-heading"><span><Layers3 size={14} /> IMPLEMENTATION PLAN</span></div>
                      {taskResult.plan ? <pre>{String(taskResult.plan)}</pre> : <div className="agent-section-placeholder">The plan will be saved here once generated.</div>}
                    </section>
                    <section className="agent-result-card">
                      <div className="agent-section-heading"><span><Code2 size={14} /> AGENT REPORT</span></div>
                      {taskResult.output ? <pre>{String(taskResult.output)}</pre> : <div className="agent-section-placeholder">Tool results, implementation notes and the final report will appear here.</div>}
                      {Array.isArray(taskResult.toolsUsed) && taskResult.toolsUsed.length > 0 && (
                        <div className="agent-tool-chips">{taskResult.toolsUsed.map((name: string) => <span key={name}>{name}</span>)}</div>
                      )}
                      {selectedTask.status === "completed" && (
                        <div className="agent-feedback">
                          <span>Was this result useful?</span>
                          <div>
                            <button type="button" title="Helpful" aria-label="Mark result helpful"
                              className={detail?.feedback?.helpful === true ? "selected" : ""}
                              onClick={() => void handleFeedback(true)} disabled={feedbackBusy}>
                              <ThumbsUp size={14} />
                            </button>
                            <button type="button" title="Not helpful" aria-label="Mark result not helpful"
                              className={detail?.feedback?.helpful === false ? "selected" : ""}
                              onClick={() => void handleFeedback(false)} disabled={feedbackBusy}>
                              <ThumbsDown size={14} />
                            </button>
                          </div>
                          <small>{detail?.feedback
                            ? "Feedback saved. It informs future project guidance."
                            : "Optional feedback helps RMango evaluate future project guidance."}</small>
                        </div>
                      )}
                    </section>
                  </div>

                  <section className="agent-verification-card">
                    <div className="agent-section-heading">
                      <span><ShieldCheck size={14} /> VERIFICATION</span>
                      <span className={verification?.runtimeVerified ? "agent-verified" : "agent-not-verified"}>{verification?.runtimeVerified ? "STUDIO VERIFIED" : "RUNTIME NOT VERIFIED"}</span>
                    </div>
                    {verification ? (
                      <>
                        <div className="agent-verification-metrics">
                          <div><strong>{verification.playtestPassed === true ? "Passed" : verification.playtestPassed === false ? "Failed" : verification.playtestAttempted ? "Attempted" : "Not run"}</strong><span>Studio playtest</span></div>
                          <div><strong>{verification.consoleClean === true ? "Clean" : verification.consoleClean === false ? "Errors found" : verification.consoleInspected ? "Inspected" : "Not inspected"}</strong><span>Studio console</span></div>
                          <div><strong>{verification.proposals?.length || 0}</strong><span>File proposals</span></div>
                          <div><strong>{verification.studioEvidence?.length || 0}</strong><span>Studio results</span></div>
                        </div>
                        <p>{String(verification.note || "Review the evidence before treating the task as verified.")}</p>
                      </>
                    ) : (
                      <p>Rmango will report live playtest and console evidence here. A code edit or successful Studio command does not automatically count as a passed gameplay test.</p>
                    )}
                    {verification?.proposals?.length > 0 && <button className="agent-review-proposals" onClick={onReviewProposals}>Review proposed file changes <ArrowUpRight size={12} /></button>}
                  </section>

                  <section className="agent-activity-card">
                    <div className="agent-activity-header">
                      <div className="agent-section-heading"><span><Activity size={14} /> LIVE ACTIVITY</span><small>{events.length} saved events</small></div>
                      <div className="agent-event-filters">
                        <button className={eventFilter === "all" ? "active" : ""} onClick={() => setEventFilter("all")}>All</button>
                        <button className={eventFilter === "tools" ? "active" : ""} onClick={() => setEventFilter("tools")}>Tools</button>
                        <button className={eventFilter === "errors" ? "active" : ""} onClick={() => setEventFilter("errors")}>Errors</button>
                      </div>
                    </div>
                    {events.length === 0 ? (
                      <div className="agent-section-placeholder">Saved workflow events appear here as the task progresses.</div>
                    ) : (
                      <div className="agent-event-list">
                        {events.map(event => (
                          <div className={"agent-event " + (/failed|error|timeout/i.test(event.event_type) ? "failed" : "")} key={event.id}>
                            <span className="agent-event-icon"><EventIcon type={event.event_type} /></span>
                            <div className="agent-event-body">
                              <strong>{event.event_type.replace(/_/g, " ")}</strong>
                              <p>{event.message}</p>
                              {eventMeta(event) && <small>{eventMeta(event)}</small>}
                              {event.data?.inputPreview && <details><summary>Tool input</summary><pre>{String(event.data.inputPreview)}</pre></details>}
                              {event.data?.outputPreview && <details><summary>Tool result</summary><pre>{String(event.data.outputPreview)}</pre></details>}
                              {event.data?.error && <details><summary>Error details</summary><pre>{String(event.data.error)}</pre></details>}
                            </div>
                            <time>{timeLabel(event.created_at)}</time>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}
            </main>
          </div>
        </>
      )}
    </section>
  );
}
