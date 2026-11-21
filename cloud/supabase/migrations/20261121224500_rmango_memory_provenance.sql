-- Memory provenance, preserved revisions, and source-change invalidation.
begin;

alter table public.project_memories
  add column if not exists provenance text not null default 'legacy_unverified',
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists confidence text not null default 'unverified',
  add column if not exists evidence_file_id uuid references public.project_files(id) on delete set null,
  add column if not exists evidence_sha256 text,
  add column if not exists evidence_snippet_sha256 text,
  add column if not exists verified_at timestamptz,
  add column if not exists revision_count integer not null default 0;

alter table public.project_memories
  drop constraint if exists project_memories_provenance_check,
  add constraint project_memories_provenance_check
    check (provenance in ('legacy_unverified','model_unverified','source_excerpt')),
  drop constraint if exists project_memories_verification_status_check,
  add constraint project_memories_verification_status_check
    check (verification_status in ('unverified','excerpt_present','source_changed','source_deleted')),
  drop constraint if exists project_memories_confidence_check,
  add constraint project_memories_confidence_check
    check (confidence in ('unverified','source_excerpt_present'));

create index if not exists project_memories_provenance_idx
  on public.project_memories(owner_id, project_id, provenance, updated_at desc);

create table if not exists public.project_memory_revisions (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.project_memories(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  memory_type text not null,
  title text not null,
  content text not null,
  source_ref text,
  provenance text not null,
  verification_status text not null,
  confidence text not null,
  evidence_file_id uuid,
  evidence_sha256 text,
  evidence_snippet_sha256 text,
  verified_at timestamptz,
  replaced_at timestamptz not null default now(),
  unique (memory_id, revision_number)
);

create index if not exists project_memory_revisions_lookup_idx
  on public.project_memory_revisions(owner_id, project_id, memory_id, revision_number desc);

alter table public.project_memory_revisions enable row level security;
create policy "project memory revisions owner read" on public.project_memory_revisions
  for select to authenticated
  using (
    owner_id = (select auth.uid()) and exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = (select auth.uid())
    )
  );

grant select on public.project_memory_revisions to authenticated;
grant all privileges on public.project_memory_revisions to service_role;

create or replace function public.preserve_project_memory_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if row(
    old.memory_type, old.title, old.content, old.source_ref,
    old.provenance, old.verification_status, old.confidence,
    old.evidence_file_id, old.evidence_sha256, old.evidence_snippet_sha256,
    old.verified_at
  ) is distinct from row(
    new.memory_type, new.title, new.content, new.source_ref,
    new.provenance, new.verification_status, new.confidence,
    new.evidence_file_id, new.evidence_sha256, new.evidence_snippet_sha256,
    new.verified_at
  ) then
    new.revision_count := old.revision_count + 1;
    insert into public.project_memory_revisions (
      memory_id, project_id, owner_id, revision_number,
      memory_type, title, content, source_ref,
      provenance, verification_status, confidence,
      evidence_file_id, evidence_sha256, evidence_snippet_sha256, verified_at
    ) values (
      old.id, old.project_id, old.owner_id, new.revision_count,
      old.memory_type, old.title, old.content, old.source_ref,
      old.provenance, old.verification_status, old.confidence,
      old.evidence_file_id, old.evidence_sha256, old.evidence_snippet_sha256, old.verified_at
    );
  end if;
  return new;
end;
$$;

revoke all on function public.preserve_project_memory_revision() from public, anon, authenticated;
drop trigger if exists project_memory_revision_before_update on public.project_memories;
create trigger project_memory_revision_before_update
  before update on public.project_memories
  for each row execute function public.preserve_project_memory_revision();

create or replace function public.invalidate_project_memory_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.project_memories
      set verification_status = 'source_deleted',
          confidence = 'unverified',
          verified_at = null,
          updated_at = now()
      where evidence_file_id = old.id
        and verification_status = 'excerpt_present';
    return old;
  end if;

  if old.sha256 is distinct from new.sha256 then
    update public.project_memories
      set verification_status = 'source_changed',
          confidence = 'unverified',
          verified_at = null,
          updated_at = now()
      where evidence_file_id = old.id
        and evidence_sha256 is distinct from new.sha256
        and verification_status = 'excerpt_present';
  end if;
  return new;
end;
$$;

revoke all on function public.invalidate_project_memory_evidence() from public, anon, authenticated;
drop trigger if exists project_memory_evidence_after_update on public.project_files;
create trigger project_memory_evidence_after_update
  after update of sha256 on public.project_files
  for each row execute function public.invalidate_project_memory_evidence();
drop trigger if exists project_memory_evidence_before_delete on public.project_files;
create trigger project_memory_evidence_before_delete
  before delete on public.project_files
  for each row execute function public.invalidate_project_memory_evidence();

commit;
