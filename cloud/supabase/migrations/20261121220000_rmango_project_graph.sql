-- Incremental source graph: replace the structural index of one file atomically.
begin;

create table if not exists public.project_file_symbols (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  file_id uuid not null references public.project_files(id) on delete cascade,
  symbol_name text not null check (char_length(symbol_name) between 1 and 160),
  symbol_kind text not null check (symbol_kind in ('function','type','class','constant','module','variable')),
  line_number integer not null check (line_number > 0),
  signature text not null default '',
  created_at timestamptz not null default now(),
  unique (file_id, symbol_name, symbol_kind, line_number)
);
create index if not exists project_file_symbols_lookup_idx
  on public.project_file_symbols(owner_id, project_id, lower(symbol_name));
create index if not exists project_file_symbols_file_idx
  on public.project_file_symbols(file_id, line_number);

create table if not exists public.project_file_edges (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_file_id uuid not null references public.project_files(id) on delete cascade,
  edge_type text not null check (edge_type in ('import','require')),
  specifier text not null check (char_length(specifier) between 1 and 300),
  target_hint text,
  line_number integer not null check (line_number > 0),
  created_at timestamptz not null default now(),
  unique (source_file_id, edge_type, line_number, specifier)
);
create index if not exists project_file_edges_source_idx
  on public.project_file_edges(owner_id, project_id, source_file_id);
create index if not exists project_file_edges_target_idx
  on public.project_file_edges(owner_id, project_id, target_hint);

alter table public.project_file_symbols enable row level security;
alter table public.project_file_edges enable row level security;
create policy "project file symbols owner all" on public.project_file_symbols for all to authenticated
using (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())
  )
)
with check (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())
  )
);
create policy "project file edges owner all" on public.project_file_edges for all to authenticated
using (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())
  )
)
with check (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())
  )
);
grant select, insert, update, delete on public.project_file_symbols, public.project_file_edges to authenticated;
grant all privileges on public.project_file_symbols, public.project_file_edges to service_role;

create or replace function public.replace_project_file_graph(
  p_file_id uuid, p_symbols jsonb, p_edges jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.project_files%rowtype;
  v_symbol_count integer;
  v_edge_count integer;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_file from public.project_files f
    where f.id = p_file_id and f.owner_id = auth.uid()
    for update;
  if not found then raise exception 'project_file_not_found'; end if;
  if jsonb_typeof(p_symbols) <> 'array' or jsonb_typeof(p_edges) <> 'array'
     or jsonb_array_length(p_symbols) > 2000 or jsonb_array_length(p_edges) > 1000 then
    raise exception 'invalid_project_graph_payload';
  end if;

  delete from public.project_file_symbols where file_id = p_file_id and owner_id = auth.uid();
  delete from public.project_file_edges where source_file_id = p_file_id and owner_id = auth.uid();

  insert into public.project_file_symbols (
    project_id, owner_id, file_id, symbol_name, symbol_kind, line_number, signature
  )
  select v_file.project_id, v_file.owner_id, v_file.id,
    left(trim(x.symbol_name), 160), x.symbol_kind,
    greatest(1, least(coalesce(x.line_number, 1), 10000000)),
    left(coalesce(x.signature, ''), 300)
  from jsonb_to_recordset(p_symbols) as x(
    symbol_name text, symbol_kind text, line_number integer, signature text
  )
  where nullif(trim(x.symbol_name), '') is not null
    and x.symbol_kind in ('function','type','class','constant','module','variable');
  get diagnostics v_symbol_count = row_count;

  insert into public.project_file_edges (
    project_id, owner_id, source_file_id, edge_type, specifier, target_hint, line_number
  )
  select v_file.project_id, v_file.owner_id, v_file.id,
    x.edge_type, left(trim(x.specifier), 300),
    nullif(left(trim(x.target_hint), 500), ''),
    greatest(1, least(coalesce(x.line_number, 1), 10000000))
  from jsonb_to_recordset(p_edges) as x(
    edge_type text, specifier text, target_hint text, line_number integer
  )
  where x.edge_type in ('import','require') and nullif(trim(x.specifier), '') is not null;
  get diagnostics v_edge_count = row_count;

  update public.project_files set indexed_at = now()
  where id = v_file.id and owner_id = v_file.owner_id;
  return jsonb_build_object('symbols', v_symbol_count, 'edges', v_edge_count);
end;
$$;
revoke all on function public.replace_project_file_graph(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.replace_project_file_graph(uuid,jsonb,jsonb) to authenticated;
commit;
