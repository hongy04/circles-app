-- Circles Step 8 — controlled multi-account development testing
--
-- These helpers operate only on confirmed auth users whose email is either:
--   dev@circles.local
--   dev+anything@circles.local
--
-- They never create auth users and never touch relationships involving a
-- non-development account. The app also hides all callers outside __DEV__.

create or replace function public.is_circles_dev_test_email(candidate text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(coalesce(candidate, ''))
    ~ '^dev(\+[a-z0-9._-]+)?@circles\.local$';
$$;

revoke all on function public.is_circles_dev_test_email(text) from public;


create or replace function public.dev_ensure_test_profile(
  p_display_name text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  viewer_id uuid := auth.uid();
  viewer_email text;
  fallback_name text;
  cleaned_name text := nullif(trim(p_display_name), '');
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

  if cleaned_name is not null and length(cleaned_name) > 40 then
    raise exception 'Display name must be 40 characters or fewer';
  end if;

  fallback_name := case
    when split_part(split_part(viewer_email, '@', 1), '+', 2) <> '' then
      initcap(replace(split_part(split_part(viewer_email, '@', 1), '+', 2), '.', ' '))
    else 'Developer'
  end;

  insert into public.users as target (id, phone_hash, display_name)
  values (
    viewer_id,
    encode(digest('circles-dev-test:' || viewer_id::text, 'sha256'), 'hex'),
    coalesce(cleaned_name, fallback_name)
  )
  on conflict (id) do update
    set display_name = coalesce(target.display_name, excluded.display_name);
end;
$$;

revoke all on function public.dev_ensure_test_profile(text) from public;
grant execute on function public.dev_ensure_test_profile(text) to authenticated;


create or replace function public.dev_prepare_test_network()
returns table (
  id uuid,
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
          initcap(replace(split_part(split_part(au.email, '@', 1), '+', 2), '.', ' '))
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


create or replace function public.dev_reset_test_relationships()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  viewer_id uuid := auth.uid();
  viewer_email text;
  request_count integer := 0;
  connection_count integer := 0;
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

  delete from public.connection_requests r
  where r.from_user in (
      select au.id
      from auth.users au
      where au.email_confirmed_at is not null
        and public.is_circles_dev_test_email(au.email)
    )
    and r.to_user in (
      select au.id
      from auth.users au
      where au.email_confirmed_at is not null
        and public.is_circles_dev_test_email(au.email)
    );
  get diagnostics request_count = row_count;

  delete from public.connections c
  where c.user_id in (
      select au.id
      from auth.users au
      where au.email_confirmed_at is not null
        and public.is_circles_dev_test_email(au.email)
    )
    and c.other_user_id in (
      select au.id
      from auth.users au
      where au.email_confirmed_at is not null
        and public.is_circles_dev_test_email(au.email)
    );
  get diagnostics connection_count = row_count;

  -- Mutual-contact edges intentionally remain so the normal request flow can
  -- be exercised again immediately after the reset.
  return jsonb_build_object(
    'requests_deleted', request_count,
    'connections_deleted', connection_count
  );
end;
$$;

revoke all on function public.dev_reset_test_relationships() from public;
grant execute on function public.dev_reset_test_relationships() to authenticated;
