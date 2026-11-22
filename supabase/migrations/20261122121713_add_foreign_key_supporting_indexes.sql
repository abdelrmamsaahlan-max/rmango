-- Add leading-column indexes for foreign keys flagged by the Supabase
-- performance advisor. Existing compound indexes were reviewed; none had
-- these FK columns as their leading column.
CREATE INDEX IF NOT EXISTS agent_events_task_id_idx
  ON public.agent_events (task_id);
CREATE INDEX IF NOT EXISTS agent_tasks_conversation_id_idx
  ON public.agent_tasks (conversation_id);
CREATE INDEX IF NOT EXISTS agent_tasks_project_id_idx
  ON public.agent_tasks (project_id);
CREATE INDEX IF NOT EXISTS conversations_project_id_idx
  ON public.conversations (project_id);
CREATE INDEX IF NOT EXISTS messages_owner_id_idx
  ON public.messages (owner_id);
CREATE INDEX IF NOT EXISTS project_changes_conversation_id_idx
  ON public.project_changes (conversation_id);
CREATE INDEX IF NOT EXISTS project_changes_project_id_idx
  ON public.project_changes (project_id);
CREATE INDEX IF NOT EXISTS project_memories_project_id_fk_idx
  ON public.project_memories (project_id);
CREATE INDEX IF NOT EXISTS studio_commands_owner_id_idx
  ON public.studio_commands (owner_id);
CREATE INDEX IF NOT EXISTS studio_commands_task_id_idx
  ON public.studio_commands (task_id);
