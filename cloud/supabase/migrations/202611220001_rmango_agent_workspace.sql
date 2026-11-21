-- RMango advanced project intelligence and durable agent workspace.
-- Apply after 202611210001_rmango_cloud.sql.
alter table public.project_files add column if not exists index_version integer not null default 0;

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

create table if not exists public.project_memories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  memory_type text not null,
  title text not null,
  content text not null,
  source_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_memories_project_idx on public.project_memories(owner_id, project_id);

create table if not exists public.project_changes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  relative_path text not null,
  file_name text not null,
  original_sha256 text,
  proposed_content text not null,
  proposed_sha256 text not null,
  change_summary text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','conflict')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists project_changes_owner_project_idx
  on public.project_changes(owner_id, project_id, status, created_at desc);

create table if not exists public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  workflow_run_id text,
  status text not null default 'queued' check (status in ('queued','running','paused','waiting_approval','completed','failed','cancelled')),
  task_text text not null,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_tasks_owner_created_idx on public.agent_tasks(owner_id, created_at desc);

create table if not exists public.agent_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  message text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists agent_events_task_created_idx on public.agent_events(owner_id, task_id, created_at);

create table if not exists public.studio_connectors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  connector_name text not null default 'Rmango Desktop',
  connector_secret_hash text not null,
  studio_tools jsonb not null default '[]'::jsonb,
  last_seen_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists studio_connectors_owner_idx on public.studio_connectors(owner_id, last_seen_at desc);

create table if not exists public.studio_commands (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid not null references public.studio_connectors(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.agent_tasks(id) on delete set null,
  tool_name text not null,
  tool_arguments jsonb not null default '{}'::jsonb,
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','denied')),
  execution_status text not null default 'queued' check (execution_status in ('queued','running','completed','failed','cancelled')),
  tool_result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists studio_commands_poll_idx on public.studio_commands(connector_id, execution_status, created_at);

-- Global admin-managed usage policy. Users cannot modify this table.
create table if not exists public.usage_policies (
  id boolean primary key default true check (id = true),
  -- Disabled until an administrator configures and authorizes explicit spend caps.
  enabled boolean not null default false,
  daily_request_limit integer not null default 40 check (daily_request_limit > 0),
  monthly_request_limit integer not null default 800 check (monthly_request_limit > 0),
  daily_token_limit bigint not null default 120000 check (daily_token_limit > 0),
  monthly_token_limit bigint not null default 1500000 check (monthly_token_limit > 0),
  daily_spend_limit_usd numeric(14,6) not null default 0 check (daily_spend_limit_usd >= 0),
  monthly_spend_limit_usd numeric(14,6) not null default 0 check (monthly_spend_limit_usd >= 0),
  max_output_tokens integer not null default 4096 check (max_output_tokens between 256 and 8192),
  updated_at timestamptz not null default now()
);
insert into public.usage_policies(id) values (true) on conflict (id) do nothing;

create table if not exists public.usage_reservations (
  request_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  model_profile text not null,
  estimated_tokens integer not null check (estimated_tokens >= 0),
  estimated_cost_usd numeric(14,8) not null default 0 check (estimated_cost_usd >= 0),
  created_at timestamptz not null default now()
);
create index if not exists usage_reservations_owner_created_idx on public.usage_reservations(owner_id, created_at);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  owner_id uuid not null references auth.users(id) on delete cascade,
  model_profile text not null,
  model_id text not null,
  provider text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  estimated_cost_usd numeric(14,8) not null default 0 check (estimated_cost_usd >= 0),
  status text not null default 'completed' check (status in ('completed','failed','cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists usage_events_owner_created_idx on public.usage_events(owner_id, created_at desc);

alter table public.user_profiles enable row level security;
alter table public.projects enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.project_files enable row level security;
alter table public.project_memories enable row level security;
alter table public.project_changes enable row level security;
alter table public.agent_tasks enable row level security;
alter table public.agent_events enable row level security;
alter table public.studio_connectors enable row level security;
alter table public.studio_commands enable row level security;
alter table public.usage_policies enable row level security;
alter table public.usage_reservations enable row level security;
alter table public.usage_events enable row level security;

create policy "profile read own" on public.user_profiles for select to authenticated using (user_id = (select auth.uid()));
create policy "profile update own display fields" on public.user_profiles for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.user_profiles from authenticated;
grant update(display_name, updated_at) on public.user_profiles to authenticated;

create policy "projects owner all" on public.projects for all to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "conversations owner all" on public.conversations for all to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "messages owner all" on public.messages for all to authenticated
using (owner_id = (select auth.uid())) with check (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.owner_id = (select auth.uid())
  )
);

create policy "project files owner all" on public.project_files for all to authenticated
using (owner_id = (select auth.uid())) with check (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())
  )
);

create policy "project memories owner all" on public.project_memories for all to authenticated
using (owner_id = (select auth.uid())) with check (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())
  )
);
create policy "project changes owner read" on public.project_changes for select to authenticated
using (owner_id = (select auth.uid()));
create policy "project changes owner insert" on public.project_changes for insert to authenticated
with check (
  owner_id = (select auth.uid()) and status = 'pending' and exists (
    select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())
  )
);
create policy "project changes owner review" on public.project_changes for update to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "agent tasks owner all" on public.agent_tasks for all to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "agent events owner select" on public.agent_events for select to authenticated
using (owner_id = (select auth.uid()));

create policy "studio connectors owner all" on public.studio_connectors for all to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "studio commands owner select" on public.studio_commands for select to authenticated
using (owner_id = (select auth.uid()));
create policy "studio commands owner insert" on public.studio_commands for insert to authenticated
with check (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.studio_connectors sc
    where sc.id = connector_id and sc.owner_id = (select auth.uid()) and sc.disconnected_at is null
  )
);
create policy "studio commands owner approval" on public.studio_commands for update to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "usage policy readable" on public.usage_policies for select to authenticated using (true);
create policy "usage reservations owner select" on public.usage_reservations for select to authenticated
using (owner_id = (select auth.uid()));
create policy "usage events owner select" on public.usage_events for select to authenticated
using (owner_id = (select auth.uid()));

-- Usage reservations are atomic and tied to auth.uid(); no user-supplied user_id is trusted.
create or replace function public.reserve_ai_request(
  p_user_id uuid,
  p_request_id uuid,
  p_model_profile text,
  p_estimated_tokens integer,
  p_estimated_cost_usd numeric
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $
declare
  v_user_id uuid := p_user_id;
  v_policy public.usage_policies%rowtype;
  v_today_requests bigint;
  v_month_requests bigint;
  v_today_tokens bigint;
  v_month_tokens bigint;
  v_today_cost numeric(14,8);
  v_month_cost numeric(14,8);
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then raise exception 'service_role_required'; end if;
  if v_user_id is null then raise exception 'invalid_user'; end if;
  if p_request_id is null or p_estimated_tokens < 0 then raise exception 'invalid_request'; end if;
  if p_model_profile not in ('fast','developer','think','vision','agent') then raise exception 'invalid_model_profile'; end if;

  perform pg_advisory_xact_lock(hashtextextended('rmango-global-spend', 0));
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  -- A crashed request must not hold reserved quota forever. Route maxDuration is
  -- bounded well below this two-hour safety window.
  delete from public.usage_reservations
    where created_at < now() - interval '2 hours';

  select * into v_policy from public.usage_policies where id = true;
  if not found or not v_policy.enabled
     or v_policy.daily_spend_limit_usd <= 0
     or v_policy.monthly_spend_limit_usd <= 0 then
    return jsonb_build_object('allowed', false, 'reason', 'admin_spend_policy_not_enabled');
  end if;
  if p_estimated_cost_usd is null or p_estimated_cost_usd < 0 then
    return jsonb_build_object('allowed', false, 'reason', 'model_cost_unavailable');
  end if;

  select count(*) into v_today_requests from public.usage_events
    where owner_id = v_user_id and created_at >= date_trunc('day', now());
  select count(*) into v_month_requests from public.usage_events
    where owner_id = v_user_id and created_at >= date_trunc('month', now());
  select coalesce(sum(input_tokens + output_tokens), 0) into v_today_tokens from public.usage_events
    where owner_id = v_user_id and created_at >= date_trunc('day', now());
  select coalesce(sum(input_tokens + output_tokens), 0) into v_month_tokens from public.usage_events
    where owner_id = v_user_id and created_at >= date_trunc('month', now());
  select coalesce(sum(estimated_cost_usd), 0) into v_today_cost from public.usage_events
    where created_at >= date_trunc('day', now());
  select coalesce(sum(estimated_cost_usd), 0) into v_month_cost from public.usage_events
    where created_at >= date_trunc('month', now());

  v_today_requests := v_today_requests + (select count(*) from public.usage_reservations
    where owner_id = v_user_id and created_at >= date_trunc('day', now()));
  v_month_requests := v_month_requests + (select count(*) from public.usage_reservations
    where owner_id = v_user_id and created_at >= date_trunc('month', now()));
  v_today_tokens := v_today_tokens + (select coalesce(sum(estimated_tokens),0) from public.usage_reservations
    where owner_id = v_user_id and created_at >= date_trunc('day', now()));
  v_month_tokens := v_month_tokens + (select coalesce(sum(estimated_tokens),0) from public.usage_reservations
    where owner_id = v_user_id and created_at >= date_trunc('month', now()));
  v_today_cost := v_today_cost + (select coalesce(sum(estimated_cost_usd),0) from public.usage_reservations
    where created_at >= date_trunc('day', now()));
  v_month_cost := v_month_cost + (select coalesce(sum(estimated_cost_usd),0) from public.usage_reservations
    where created_at >= date_trunc('month', now()));

  if v_today_requests >= v_policy.daily_request_limit then
    return jsonb_build_object('allowed', false, 'reason', 'daily_request_limit');
  end if;
  if v_month_requests >= v_policy.monthly_request_limit then
    return jsonb_build_object('allowed', false, 'reason', 'monthly_request_limit');
  end if;
  if v_today_tokens + p_estimated_tokens > v_policy.daily_token_limit then
    return jsonb_build_object('allowed', false, 'reason', 'daily_token_limit');
  end if;
  if v_month_tokens + p_estimated_tokens > v_policy.monthly_token_limit then
    return jsonb_build_object('allowed', false, 'reason', 'monthly_token_limit');
  end if;
  if v_today_cost + p_estimated_cost_usd > v_policy.daily_spend_limit_usd then
    return jsonb_build_object('allowed', false, 'reason', 'daily_spend_limit');
  end if;
  if v_month_cost + p_estimated_cost_usd > v_policy.monthly_spend_limit_usd then
    return jsonb_build_object('allowed', false, 'reason', 'monthly_spend_limit');
  end if;

  insert into public.usage_reservations(request_id, owner_id, model_profile, estimated_tokens, estimated_cost_usd)
    values (p_request_id, v_user_id, p_model_profile, p_estimated_tokens, p_estimated_cost_usd);

  return jsonb_build_object(
    'allowed', true,
    'max_output_tokens', v_policy.max_output_tokens,
    'daily_requests_remaining', greatest(v_policy.daily_request_limit - v_today_requests - 1, 0),
    'monthly_requests_remaining', greatest(v_policy.monthly_request_limit - v_month_requests - 1, 0),
    'daily_spend_remaining_usd', greatest(v_policy.daily_spend_limit_usd - v_today_cost - p_estimated_cost_usd, 0),
    'monthly_spend_remaining_usd', greatest(v_policy.monthly_spend_limit_usd - v_month_cost - p_estimated_cost_usd, 0)
  );
end;
$$;

create or replace function public.complete_ai_request(
  p_user_id uuid,
  p_request_id uuid,
  p_model_profile text,
  p_model_id text,
  p_provider text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_estimated_cost_usd numeric
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := p_user_id;
  v_reservation public.usage_reservations%rowtype;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then raise exception 'service_role_required'; end if;
  if v_user_id is null then raise exception 'invalid_user'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  select * into v_reservation from public.usage_reservations
    where request_id = p_request_id and owner_id = v_user_id for update;
  if not found then raise exception 'usage_reservation_not_found'; end if;

  insert into public.usage_events(
    request_id, owner_id, model_profile, model_id, provider,
    input_tokens, output_tokens, estimated_cost_usd, status
  ) values (
    p_request_id, v_user_id, p_model_profile, p_model_id, p_provider,
    greatest(p_input_tokens,0), greatest(p_output_tokens,0), greatest(p_estimated_cost_usd,0), 'completed'
  );
  delete from public.usage_reservations where request_id = p_request_id and owner_id = v_user_id;
end;
$$;

create or replace function public.cancel_ai_request(p_user_id uuid, p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $
declare v_user_id uuid := p_user_id;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then raise exception 'service_role_required'; end if;
  if v_user_id is null then raise exception 'invalid_user'; end if;
  delete from public.usage_reservations where request_id = p_request_id and owner_id = v_user_id;
end;
$$;

revoke all on function public.reserve_ai_request(uuid,uuid,text,integer) from public, anon, authenticated;
revoke all on function public.complete_ai_request(uuid,uuid,text,text,text,integer,integer,numeric) from public, anon, authenticated;
revoke all on function public.cancel_ai_request(uuid,uuid) from public, anon, authenticated;
grant execute on function public.reserve_ai_request(uuid,uuid,text,integer) to service_role;
grant execute on function public.complete_ai_request(uuid,uuid,text,text,text,integer,integer,numeric) to service_role;
grant execute on function public.cancel_ai_request(uuid,uuid) to service_role;

-- Private object bucket. Storage paths must begin with the authenticated user's UUID.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'rmango-files',
  'rmango-files',
  false,
  15728640,
  array['image/png','image/jpeg','image/webp','image/gif','text/plain','text/markdown','application/json','text/csv','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "rmango files owner read" on storage.objects for select to authenticated
using (bucket_id = 'rmango-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "rmango files owner upload" on storage.objects for insert to authenticated
with check (bucket_id = 'rmango-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "rmango files owner update" on storage.objects for update to authenticated
using (bucket_id = 'rmango-files' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'rmango-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "rmango files owner delete" on storage.objects for delete to authenticated
using (bucket_id = 'rmango-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Local Studio connector command claiming is scoped to the signed-in account.
create or replace function public.claim_studio_commands(p_connector_id uuid, p_limit integer default 5)
returns setof public.studio_commands
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if not exists (
    select 1 from public.studio_connectors sc
    where sc.id = p_connector_id and sc.owner_id = v_user_id and sc.disconnected_at is null
  ) then raise exception 'connector_not_found'; end if;

  update public.studio_connectors
  set last_seen_at = now()
  where id = p_connector_id and owner_id = v_user_id;

  return query
  with next_commands as (
    select c.id from public.studio_commands c
    where c.connector_id = p_connector_id
      and c.owner_id = v_user_id
      and c.execution_status = 'queued'
    order by c.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 10))
  )
  update public.studio_commands c
  set execution_status = 'running', updated_at = now()
  from next_commands n
  where c.id = n.id
  returning c.*;
end;
$$;

revoke all on function public.claim_studio_commands(uuid,integer) from public, anon;
grant execute on function public.claim_studio_commands(uuid,integer) to authenticated;

