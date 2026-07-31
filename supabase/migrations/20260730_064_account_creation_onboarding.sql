-- Phase 10A: real account creation and resumable onboarding.
-- Existing accounts are backfilled as complete; accounts created after this
-- migration begin with null onboarding timestamps and are routed through the
-- profile and contacts steps.

alter table public.users
  add column if not exists onboarding_profile_completed_at timestamptz,
  add column if not exists onboarding_contacts_completed_at timestamptz,
  add column if not exists onboarding_contacts_choice text;

alter table public.users
  drop constraint if exists users_onboarding_contacts_choice_check;

alter table public.users
  add constraint users_onboarding_contacts_choice_check
  check (
    onboarding_contacts_choice is null
    or onboarding_contacts_choice in ('synced', 'skipped', 'unavailable', 'existing')
  );

-- This migration lands after the development/test population already exists.
-- Do not force those established accounts back through first-run onboarding.
update public.users
set
  onboarding_profile_completed_at = coalesce(onboarding_profile_completed_at, now()),
  onboarding_contacts_completed_at = coalesce(onboarding_contacts_completed_at, now()),
  onboarding_contacts_choice = coalesce(onboarding_contacts_choice, 'existing')
where deleted_at is null;

create or replace function public.get_my_onboarding_state()
returns table (
  profile_completed boolean,
  contacts_completed boolean,
  display_name text,
  username text,
  avatar_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Please sign in first';
  end if;

  return query
  select
    user_row.onboarding_profile_completed_at is not null,
    user_row.onboarding_contacts_completed_at is not null,
    coalesce(user_row.display_name, ''),
    coalesce(user_row.username, ''),
    user_row.avatar_url
  from public.users user_row
  where user_row.id = v_user_id
    and user_row.deleted_at is null;

  if not found then
    raise exception 'Profile record not found';
  end if;
end;
$$;

revoke all on function public.get_my_onboarding_state() from public;
grant execute on function public.get_my_onboarding_state() to authenticated;

create or replace function public.is_username_available(p_username text)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_username text := lower(nullif(regexp_replace(btrim(coalesce(p_username, '')), '^@+', ''), ''));
begin
  if v_user_id is null then
    raise exception 'Please sign in first';
  end if;

  if v_username is null
     or char_length(v_username) < 3
     or char_length(v_username) > 24
     or v_username !~ '^[a-z0-9][a-z0-9._]{1,22}[a-z0-9]$' then
    return false;
  end if;

  return not exists (
    select 1
    from public.users user_row
    where lower(user_row.username) = v_username
      and user_row.id <> v_user_id
      and user_row.deleted_at is null
  );
end;
$$;

revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to authenticated;

create or replace function public.complete_my_profile_onboarding(
  p_display_name text,
  p_username text,
  p_bio text,
  p_avatar_url text
)
returns table (
  id uuid,
  display_name text,
  username text,
  avatar_url text,
  bio text,
  onboarding_profile_completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := nullif(btrim(p_display_name), '');
  v_username text := lower(nullif(regexp_replace(btrim(coalesce(p_username, '')), '^@+', ''), ''));
  v_bio text := nullif(btrim(coalesce(p_bio, '')), '');
begin
  if v_user_id is null then
    raise exception 'Please sign in first';
  end if;

  if v_name is null then
    raise exception 'Display name is required';
  end if;

  if char_length(v_name) > 40 then
    raise exception 'Display name must be 40 characters or fewer';
  end if;

  if v_username is null then
    raise exception 'Username is required';
  end if;

  if char_length(v_username) < 3 or char_length(v_username) > 24 then
    raise exception 'Username must be between 3 and 24 characters';
  end if;

  if v_username !~ '^[a-z0-9][a-z0-9._]{1,22}[a-z0-9]$' then
    raise exception 'Username can use lowercase letters, numbers, periods, and underscores';
  end if;

  if v_bio is not null and char_length(v_bio) > 160 then
    raise exception 'Bio must be 160 characters or fewer';
  end if;

  update public.users user_row
  set
    display_name = v_name,
    username = v_username,
    bio = v_bio,
    avatar_url = nullif(btrim(coalesce(p_avatar_url, '')), ''),
    onboarding_profile_completed_at = coalesce(
      user_row.onboarding_profile_completed_at,
      now()
    )
  where user_row.id = v_user_id
    and user_row.deleted_at is null;

  if not found then
    raise exception 'Profile record not found';
  end if;

  return query
  select
    user_row.id,
    user_row.display_name,
    user_row.username,
    user_row.avatar_url,
    user_row.bio,
    user_row.onboarding_profile_completed_at
  from public.users user_row
  where user_row.id = v_user_id;
exception
  when unique_violation then
    raise exception using
      errcode = '23505',
      message = 'That username is already taken';
end;
$$;

revoke all on function public.complete_my_profile_onboarding(text, text, text, text) from public;
grant execute on function public.complete_my_profile_onboarding(text, text, text, text) to authenticated;

create or replace function public.complete_my_contacts_onboarding(
  p_choice text default 'skipped'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_choice text := lower(coalesce(nullif(btrim(p_choice), ''), 'skipped'));
begin
  if v_user_id is null then
    raise exception 'Please sign in first';
  end if;

  if v_choice not in ('synced', 'skipped', 'unavailable') then
    raise exception 'Invalid contacts onboarding choice';
  end if;

  update public.users user_row
  set
    onboarding_contacts_completed_at = coalesce(
      user_row.onboarding_contacts_completed_at,
      now()
    ),
    onboarding_contacts_choice = v_choice
  where user_row.id = v_user_id
    and user_row.deleted_at is null;

  if not found then
    raise exception 'Profile record not found';
  end if;

  return jsonb_build_object(
    'completed', true,
    'choice', v_choice
  );
end;
$$;

revoke all on function public.complete_my_contacts_onboarding(text) from public;
grant execute on function public.complete_my_contacts_onboarding(text) to authenticated;
