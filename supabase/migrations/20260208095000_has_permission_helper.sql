-- Compatibility helper: public.has_permission(uuid, text)
-- Adds a stable RBAC helper used by RLS policies.
-- Non-breaking: safe even if you already have permission tables.

create or replace function public.has_permission(p_user_id uuid, p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = p_user_id
      and p.key = p_permission_key
  );
$$;

revoke all on function public.has_permission(uuid, text) from public;
grant execute on function public.has_permission(uuid, text) to authenticated;
