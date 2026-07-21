-- Circles Step 8.1 — fix ambiguous `id` in dev_prepare_test_network
--
-- Why this is needed:
-- The original PL/pgSQL function returned a table column named `id`.
-- PL/pgSQL exposes RETURN TABLE column names as variables, so
-- `on conflict (id)` became ambiguous between the output variable and
-- public.users.id.
--
-- The RPC name and arguments stay the same. Only the returned first column is
-- renamed to `account_id`, which the current app does not depend on by name.

drop function if exists public.dev_prepare_test_network();

create function public.dev_prepare_test_network()
returns table (
  account_id uuid,
  email text,
  display_name text,
  is_current boolean
)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  viewer_id uuid := auth.uid();
  viewer_email text;
begin
  if viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  select au.email
    into viewer_email
  from auth.users au
  where au.id = viewer_id
    and au.email_confirmed_at is not null;

  if not public.is_circles_dev_test_email(viewer_email) then
    raise exception 'Development test account required';
  end if;

  insert into public.users as target (id, phone_hash, display_name)
  select
    au.id,
    encode(digest('circles-dev-test:' || au.id::text, 'sha256'), 'hex'),
    coalesce(
      nullif(trim(au.raw_user_meta_data ->> 'display_name'), ''),
      case
        when split_part(split_part(au.email, '@', 1), '+', 2) <> '' then
          initcap(
            replace(
              split_part(split_part(au.email, '@', 1), '+', 2),
              '.',
              ' '
            )
          )
        else 'Developer'
      end
    )
  from auth.users au
  where au.email_confirmed_at is not null
    and public.is_circles_dev_test_email(au.email)
  on conflict (id) do update
    set display_name = coalesce(target.display_name, excluded.display_name);

  insert into public.contact_edges (from_user, to_user)
  select source_user.id, target_user.id
  from auth.users source_user
  cross join auth.users target_user
  where source_user.id <> target_user.id
    and source_user.email_confirmed_at is not null
    and target_user.email_confirmed_at is not null
    and public.is_circles_dev_test_email(source_user.email)
    and public.is_circles_dev_test_email(target_user.email)
  on conflict do nothing;

  return query
  select
    au.id,
    au.email::text,
    u.display_name,
    au.id = viewer_id
  from auth.users au
  join public.users u on u.id = au.id
  where au.email_confirmed_at is not null
    and public.is_circles_dev_test_email(au.email)
  order by au.email;
end;
$$;

revoke all on function public.dev_prepare_test_network() from public;
grant execute on function public.dev_prepare_test_network() to authenticated;
