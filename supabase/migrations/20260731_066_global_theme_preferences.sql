-- Global appearance preferences.
-- The selected curated theme is private account presentation state. It is
-- restored before the launch portal and can later coexist with per-Circle
-- shared themes without changing the user's global navigation preference.

alter table public.users
  add column if not exists theme_id text,
  add column if not exists theme_updated_at timestamptz;

update public.users
set
  theme_id = coalesce(theme_id, 'aqua-daylight'),
  theme_updated_at = coalesce(theme_updated_at, now())
where deleted_at is null;

alter table public.users
  alter column theme_id set default 'aqua-daylight',
  alter column theme_updated_at set default now();

alter table public.users
  drop constraint if exists users_theme_id_check;

alter table public.users
  add constraint users_theme_id_check
  check (
    theme_id is null
    or theme_id in (
      'aqua-daylight',
      'citrus-garden',
      'bubblegum-sky',
      'after-rain'
    )
  );

create or replace function public.get_my_theme_preference()
returns table (
  theme_id text,
  theme_updated_at timestamptz
)
language plpgsql
security definer
stable
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
    coalesce(user_row.theme_id, 'aqua-daylight'),
    user_row.theme_updated_at
  from public.users user_row
  where user_row.id = v_user_id
    and user_row.deleted_at is null;

  if not found then
    raise exception 'Profile record not found';
  end if;
end;
$$;

revoke all on function public.get_my_theme_preference() from public;
grant execute on function public.get_my_theme_preference() to authenticated;

create or replace function public.set_my_theme_preference(
  p_theme_id text
)
returns table (
  theme_id text,
  theme_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_theme_id text := lower(nullif(btrim(coalesce(p_theme_id, '')), ''));
begin
  if v_user_id is null then
    raise exception 'Please sign in first';
  end if;

  if v_theme_id is null or v_theme_id not in (
    'aqua-daylight',
    'citrus-garden',
    'bubblegum-sky',
    'after-rain'
  ) then
    raise exception 'Unknown Circles theme';
  end if;

  update public.users user_row
  set
    theme_id = v_theme_id,
    theme_updated_at = now()
  where user_row.id = v_user_id
    and user_row.deleted_at is null;

  if not found then
    raise exception 'Profile record not found';
  end if;

  return query
  select
    user_row.theme_id,
    user_row.theme_updated_at
  from public.users user_row
  where user_row.id = v_user_id;
end;
$$;

revoke all on function public.set_my_theme_preference(text) from public;
grant execute on function public.set_my_theme_preference(text) to authenticated;
