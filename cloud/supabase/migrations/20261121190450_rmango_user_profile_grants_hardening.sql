begin;

-- Remove inherited table and column privileges from client-facing roles.
-- Regrant only the exact profile operations needed by the desktop app.
revoke all privileges on table public.user_profiles from public, anon, authenticated;

grant select on table public.user_profiles to authenticated;
grant update (display_name, updated_at) on table public.user_profiles to authenticated;

commit;
