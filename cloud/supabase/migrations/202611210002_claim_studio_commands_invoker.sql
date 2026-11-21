-- The claim function performs the same connector-owner checks, but runs with
-- the signed-in caller's privileges so the table's owner-scoped RLS policies
-- remain the actual authorization boundary.
create or replace function public.claim_studio_commands(p_connector_id uuid, p_limit integer default 5)
returns setof public.studio_commands
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not exists (
    select 1
    from public.studio_connectors sc
    where sc.id = p_connector_id
      and sc.owner_id = v_user_id
      and sc.disconnected_at is null
  ) then
    raise exception 'connector_not_found';
  end if;

  update public.studio_connectors
  set last_seen_at = now()
  where id = p_connector_id
    and owner_id = v_user_id;

  return query
  with next_commands as (
    select c.id
    from public.studio_commands c
    where c.connector_id = p_connector_id
      and c.owner_id = v_user_id
      and c.execution_status = 'queued'
    order by c.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 10))
  )
  update public.studio_commands c
  set execution_status = 'running',
      updated_at = now()
  from next_commands n
  where c.id = n.id
  returning c.*;
end;
$$;

revoke all on function public.claim_studio_commands(uuid, integer) from public, anon;
grant execute on function public.claim_studio_commands(uuid, integer) to authenticated;
