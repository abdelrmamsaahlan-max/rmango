-- RMango continuous improvement signals.
-- This records compact verification metrics and explicit user ratings.
-- It does not collect prompts or retrain hosted foundation-model weights.

create table if not exists public.agent_learning_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  signal_type text not null check (signal_type in ('task_evaluated', 'user_feedback')),
  signal_data jsonb not null default '{}'::jsonb check (jsonb_typeof(signal_data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, signal_type)
);

create index if not exists agent_learning_events_owner_project_idx
  on public.agent_learning_events(owner_id, project_id, created_at desc);

alter table public.agent_learning_events enable row level security;

create policy "agent learning events owner read"
  on public.agent_learning_events
  for select to authenticated
  using (owner_id = (select auth.uid()));

grant select on public.agent_learning_events to authenticated;
