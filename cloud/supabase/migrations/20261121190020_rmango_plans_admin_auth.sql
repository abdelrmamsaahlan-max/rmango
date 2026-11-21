-- RMango account plans, verified-email admin grants, and per-plan quotas.
-- Admin account quotas are unlimited; the global USD spend guard remains mandatory.

begin;

create schema if not exists private;

alter table public.user_profiles
  add column if not exists plan text not null default 'free',
  add column if not exists admin_grant_source text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_profiles'::regclass
      and conname = 'user_profiles_plan_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_plan_check
      check (plan in ('free', 'builder', 'creator'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_profiles'::regclass
      and conname = 'user_profiles_admin_grant_source_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_admin_grant_source_check
      check (admin_grant_source is null or admin_grant_source in ('email_allowlist', 'manual'));
  end if;
end;
$$;

create table if not exists public.rmango_plan_limits (
  plan text primary key check (plan in ('free', 'builder', 'creator')),
  daily_request_limit integer not null check (daily_request_limit > 0),
  monthly_request_limit integer not null check (monthly_request_limit > 0),
  daily_token_limit bigint not null check (daily_token_limit > 0),
  monthly_token_limit bigint not null check (monthly_token_limit > 0),
  max_output_tokens integer not null check (max_output_tokens between 256 and 8192),
  updated_at timestamptz not null default now()
);

alter table public.rmango_plan_limits enable row level security;
revoke all on public.rmango_plan_limits from public, anon, authenticated;
grant select on public.rmango_plan_limits to service_role;

insert into public.rmango_plan_limits
  (plan, daily_request_limit, monthly_request_limit, daily_token_limit, monthly_token_limit, max_output_tokens)
values
  ('free',    8,   120,   20000,  180000, 1024),
  ('builder', 24,  420,   75000,  700000, 2048),
  ('creator', 60,  1200,  200000, 2000000, 4096)
on conflict (plan) do update set
  daily_request_limit = excluded.daily_request_limit,
  monthly_request_limit = excluded.monthly_request_limit,
  daily_token_limit = excluded.daily_token_limit,
  monthly_token_limit = excluded.monthly_token_limit,
  max_output_tokens = excluded.max_output_tokens,
  updated_at = now();

create table if not exists private.rmango_admin_email_allowlist (
  email text primary key check (email = lower(btrim(email))),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table private.rmango_admin_email_allowlist enable row level security;
revoke all on private.rmango_admin_email_allowlist from public, anon, authenticated, service_role;

-- Never let end users assign themselves a role or plan through the profile table.
-- Authenticated users may only edit their own display fields.
revoke all on public.user_profiles from anon;
revoke insert, delete on public.user_profiles from authenticated;
revoke update on public.user_profiles from authenticated;
grant select on public.user_profiles to authenticated;
grant update (display_name, updated_at) on public.user_profiles to authenticated;

create or replace function private.promote_rmango_allowlisted_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(new.email, '')));
  v_display_name text := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(v_email, '@', 1), ''),
    'Rmango user'
  );
begin
  if new.email_confirmed_at is not null and exists (
    select 1
    from private.rmango_admin_email_allowlist allowlist
    where allowlist.email = v_email
      and allowlist.active = true
  ) then
    insert into public.user_profiles (
      user_id, display_name, role, plan, admin_grant_source, updated_at
    )
    values (
      new.id, v_display_name, 'admin', 'creator', 'email_allowlist', now()
    )
    on conflict (user_id) do update set
      role = 'admin',
      plan = 'creator',
      admin_grant_source = 'email_allowlist',
      updated_at = now();
  elsif tg_op = 'UPDATE' then
    update public.user_profiles
    set role = 'user',
        plan = 'free',
        admin_grant_source = null,
        updated_at = now()
    where user_id = new.id
      and admin_grant_source = 'email_allowlist';
  end if;

  return new;
end;
$$;

revoke all on function private.promote_rmango_allowlisted_admin() from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.promote_rmango_allowlisted_admin() to supabase_auth_admin;

drop trigger if exists zz_rmango_admin_allowlist_sync on auth.users;
create trigger zz_rmango_admin_allowlist_sync
after insert or update of email, email_confirmed_at on auth.users
for each row execute function private.promote_rmango_allowlisted_admin();

-- The plan tier is the user-level allowance. These legacy columns are now
-- a generous upper guardrail, while the dollar limits remain the true global
-- cost circuit breaker and are intentionally not increased here.
update public.usage_policies
set daily_request_limit = 500,
    monthly_request_limit = 10000,
    daily_token_limit = 2000000,
    monthly_token_limit = 25000000,
    max_output_tokens = 4096,
    updated_at = now()
where id = true;

create or replace function public.reserve_ai_request(
  p_user_id uuid,
  p_request_id uuid,
  p_model_profile text,
  p_estimated_tokens integer,
  p_estimated_cost_usd numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := p_user_id;
  v_policy public.usage_policies%rowtype;
  v_plan_limits public.rmango_plan_limits%rowtype;
  v_role text := 'user';
  v_plan text := 'free';
  v_is_admin boolean := false;
  v_today_requests bigint := 0;
  v_month_requests bigint := 0;
  v_today_tokens bigint := 0;
  v_month_tokens bigint := 0;
  v_today_cost numeric(14,8) := 0;
  v_month_cost numeric(14,8) := 0;
  v_max_output_tokens integer := 1024;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if v_user_id is null or p_request_id is null
     or p_estimated_tokens is null or p_estimated_tokens < 0 then
    raise exception 'invalid_request';
  end if;
  if p_model_profile not in ('fast','developer','think','vision','agent') then
    raise exception 'invalid_model_profile';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rmango-global-spend', 0));
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  -- Expire reservations left by crashed requests.
  delete from public.usage_reservations
  where created_at < now() - interval '2 hours';

  select * into v_policy
  from public.usage_policies
  where id = true;

  if not found or not v_policy.enabled
     or v_policy.daily_spend_limit_usd <= 0
     or v_policy.monthly_spend_limit_usd <= 0 then
    return jsonb_build_object('allowed', false, 'reason', 'admin_spend_policy_not_enabled');
  end if;

  if p_estimated_cost_usd is null or p_estimated_cost_usd < 0 then
    return jsonb_build_object('allowed', false, 'reason', 'model_cost_unavailable');
  end if;

  select coalesce(role, 'user'), coalesce(plan, 'free')
  into v_role, v_plan
  from public.user_profiles
  where user_id = v_user_id;

  v_is_admin := coalesce(v_role = 'admin', false);

  select * into v_plan_limits
  from public.rmango_plan_limits
  where plan = case when v_plan in ('free', 'builder', 'creator') then v_plan else 'free' end;

  if not found then
    raise exception 'rmango_plan_limits_missing';
  end if;

  select count(*) into v_today_requests
  from public.usage_events
  where owner_id = v_user_id and created_at >= date_trunc('day', now());
  select count(*) into v_month_requests
  from public.usage_events
  where owner_id = v_user_id and created_at >= date_trunc('month', now());
  select coalesce(sum(input_tokens + output_tokens), 0) into v_today_tokens
  from public.usage_events
  where owner_id = v_user_id and created_at >= date_trunc('day', now());
  select coalesce(sum(input_tokens + output_tokens), 0) into v_month_tokens
  from public.usage_events
  where owner_id = v_user_id and created_at >= date_trunc('month', now());

  v_today_requests := v_today_requests + (
    select count(*) from public.usage_reservations
    where owner_id = v_user_id and created_at >= date_trunc('day', now())
  );
  v_month_requests := v_month_requests + (
    select count(*) from public.usage_reservations
    where owner_id = v_user_id and created_at >= date_trunc('month', now())
  );
  v_today_tokens := v_today_tokens + (
    select coalesce(sum(estimated_tokens), 0) from public.usage_reservations
    where owner_id = v_user_id and created_at >= date_trunc('day', now())
  );
  v_month_tokens := v_month_tokens + (
    select coalesce(sum(estimated_tokens), 0) from public.usage_reservations
    where owner_id = v_user_id and created_at >= date_trunc('month', now())
  );

  -- The service-wide USD caps apply to everyone, including the admin account.
  select coalesce(sum(estimated_cost_usd), 0) into v_today_cost
  from public.usage_events
  where created_at >= date_trunc('day', now());
  select coalesce(sum(estimated_cost_usd), 0) into v_month_cost
  from public.usage_events
  where created_at >= date_trunc('month', now());
  v_today_cost := v_today_cost + (
    select coalesce(sum(estimated_cost_usd), 0) from public.usage_reservations
    where created_at >= date_trunc('day', now())
  );
  v_month_cost := v_month_cost + (
    select coalesce(sum(estimated_cost_usd), 0) from public.usage_reservations
    where created_at >= date_trunc('month', now())
  );

  if not v_is_admin then
    if v_today_requests >= least(v_plan_limits.daily_request_limit, v_policy.daily_request_limit) then
      return jsonb_build_object('allowed', false, 'reason', 'daily_request_limit', 'plan', v_plan);
    end if;
    if v_month_requests >= least(v_plan_limits.monthly_request_limit, v_policy.monthly_request_limit) then
      return jsonb_build_object('allowed', false, 'reason', 'monthly_request_limit', 'plan', v_plan);
    end if;
    if v_today_tokens + p_estimated_tokens > least(v_plan_limits.daily_token_limit, v_policy.daily_token_limit) then
      return jsonb_build_object('allowed', false, 'reason', 'daily_token_limit', 'plan', v_plan);
    end if;
    if v_month_tokens + p_estimated_tokens > least(v_plan_limits.monthly_token_limit, v_policy.monthly_token_limit) then
      return jsonb_build_object('allowed', false, 'reason', 'monthly_token_limit', 'plan', v_plan);
    end if;
    v_max_output_tokens := least(v_policy.max_output_tokens, v_plan_limits.max_output_tokens);
  else
    -- "Unlimited" means no personal daily/monthly request or token quota.
    -- Each single response still respects the configured output safety cap.
    v_max_output_tokens := v_policy.max_output_tokens;
  end if;

  if v_today_cost + p_estimated_cost_usd > v_policy.daily_spend_limit_usd then
    return jsonb_build_object('allowed', false, 'reason', 'daily_spend_limit');
  end if;
  if v_month_cost + p_estimated_cost_usd > v_policy.monthly_spend_limit_usd then
    return jsonb_build_object('allowed', false, 'reason', 'monthly_spend_limit');
  end if;

  insert into public.usage_reservations (
    request_id, owner_id, model_profile, estimated_tokens, estimated_cost_usd
  )
  values (
    p_request_id, v_user_id, p_model_profile, p_estimated_tokens, p_estimated_cost_usd
  );

  return jsonb_build_object(
    'allowed', true,
    'plan', case when v_is_admin then 'admin' else v_plan end,
    'unlimited_account', v_is_admin,
    'max_output_tokens', v_max_output_tokens,
    'daily_requests_remaining', case when v_is_admin then null else greatest(least(v_plan_limits.daily_request_limit, v_policy.daily_request_limit) - v_today_requests - 1, 0) end,
    'monthly_requests_remaining', case when v_is_admin then null else greatest(least(v_plan_limits.monthly_request_limit, v_policy.monthly_request_limit) - v_month_requests - 1, 0) end,
    'daily_tokens_remaining', case when v_is_admin then null else greatest(least(v_plan_limits.daily_token_limit, v_policy.daily_token_limit) - v_today_tokens - p_estimated_tokens, 0) end,
    'monthly_tokens_remaining', case when v_is_admin then null else greatest(least(v_plan_limits.monthly_token_limit, v_policy.monthly_token_limit) - v_month_tokens - p_estimated_tokens, 0) end,
    'daily_spend_remaining_usd', greatest(v_policy.daily_spend_limit_usd - v_today_cost - p_estimated_cost_usd, 0),
    'monthly_spend_remaining_usd', greatest(v_policy.monthly_spend_limit_usd - v_month_cost - p_estimated_cost_usd, 0)
  );
end;
$$;

revoke all on function public.reserve_ai_request(uuid, uuid, text, integer, numeric) from public, anon, authenticated;
grant execute on function public.reserve_ai_request(uuid, uuid, text, integer, numeric) to service_role;

revoke all on function public.cancel_ai_request(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_ai_request(uuid, uuid) to service_role;

revoke all on function public.complete_ai_request(uuid, uuid, text, text, text, integer, integer, numeric) from public, anon, authenticated;
grant execute on function public.complete_ai_request(uuid, uuid, text, text, text, integer, integer, numeric) to service_role;

commit;
