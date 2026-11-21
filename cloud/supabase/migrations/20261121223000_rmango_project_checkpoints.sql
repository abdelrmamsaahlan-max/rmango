-- Reversible checkpoints around explicitly approved cloud project changes.
begin;

create table if not exists public.project_checkpoints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_change_id uuid references public.project_changes(id) on delete set null,
  label text not null check (char_length(label) between 1 and 240),
  checkpoint_kind text not null check (checkpoint_kind in ('before_change','before_restore')),
  status text not null default 'creating' check (status in ('creating','ready','restored','conflict','restore_conflict','failed')),
  created_at timestamptz not null default now(),
  restored_at timestamptz
);
create index if not exists project_checkpoints_owner_project_idx
  on public.project_checkpoints(owner_id, project_id, created_at desc);

create table if not exists public.project_checkpoint_files (
  id uuid primary key default gen_random_uuid(),
  checkpoint_id uuid not null references public.project_checkpoints(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  relative_path text not null check (char_length(relative_path) between 1 and 500),
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null default 'text/plain',
  existed_before boolean not null,
  backup_storage_path text,
  source_storage_path text,
  original_sha256 text,
  applied_sha256 text,
  size_bytes bigint not null default 0 check (size_bytes >= 0 and size_bytes <= 512000),
  created_at timestamptz not null default now(),
  unique (checkpoint_id, relative_path),
  check (
    (existed_before and backup_storage_path is not null and original_sha256 is not null)
    or
    (not existed_before and backup_storage_path is null and original_sha256 is null)
  )
);
create index if not exists project_checkpoint_files_owner_idx
  on public.project_checkpoint_files(owner_id, project_id, checkpoint_id);

alter table public.project_checkpoints enable row level security;
alter table public.project_checkpoint_files enable row level security;

create policy "project checkpoints owner all" on public.project_checkpoints for all to authenticated
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

create policy "project checkpoint files owner all" on public.project_checkpoint_files for all to authenticated
using (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.project_checkpoints c
    where c.id = checkpoint_id and c.project_id = project_id and c.owner_id = (select auth.uid())
  )
)
with check (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.project_checkpoints c
    where c.id = checkpoint_id and c.project_id = project_id and c.owner_id = (select auth.uid())
  )
);

grant select, insert, update, delete on public.project_checkpoints, public.project_checkpoint_files to authenticated;
grant all privileges on public.project_checkpoints, public.project_checkpoint_files to service_role;
commit;
