-- RMango advanced project intelligence and durable agent workspace.
-- Apply after 202611210001_rmango_cloud.sql.

alter table public.project_files
  add column if not exists index_version integer not null default 0;

create table if not exists public.project_file_symbols (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  file_id uuid not null references public.project_files(id) on delete cascade,
  symbol_type text not null,
  symbol_name text not null,
  line_number integer not null default 1 check (line_number > 0),
  created_at timestamptz not null default now(),
  unique (file_id, symbol_type, symbol_name, line_number)
);
create index if not exists project_file_symbols_project_idx
  on public.project_file_symbols(owner_id, project_id, symbol_type, symbol_name);

create table if not exists public.project_file_dependencies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_file_id uuid not null references public.project_files(id) on delete cascade,
  target_file_id uuid references public.project_files(id) on delete set null,
  dependency_type text not null check (dependency_type in ('module_require','instance_reference','service_reference','remote_reference')),
  reference text not null,
  target_name text,
  confidence numeric(4,3) not null default 0.15 check (confidence >= 0 and confidence <= 1),
  line_number integer not null default 1 check (line_number > 0),
  created_at timestamptz not null default now(),
  unique (source_file_id, dependency_type, reference, line_number)
);
create index if not exists project_file_dependencies_source_idx
  on public.project_file_dependencies(owner_id, project_id, source_file_id);
create index if not exists project_file_dependencies_target_idx
  on public.project_file_dependencies(owner_id, project_id, target_file_id);

create table if not exists public.project_index_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.agent_tasks(id) on delete set null,
  status text not null default 'running' check (status in ('running','completed','partial','failed')),
  file_count integer not null default 0,
  indexed_count integer not null default 0,
  dependency_count integer not null default 0,
  symbol_count integer not null default 0,
  error_count integer not null default 0,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists project_index_runs_project_idx
  on public.project_index_runs(owner_id, project_id, started_at desc);

alter table public.project_file_symbols enable row level security;
alter table public.project_file_dependencies enable row level security;
alter table public.project_index_runs enable row level security;

create policy "project file symbols owner read" on public.project_file_symbols
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "project file dependencies owner read" on public.project_file_dependencies
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "project index runs owner read" on public.project_index_runs
  for select to authenticated using (owner_id = (select auth.uid()));

grant select on public.project_file_symbols to authenticated;
grant select on public.project_file_dependencies to authenticated;
grant select on public.project_index_runs to authenticated;
