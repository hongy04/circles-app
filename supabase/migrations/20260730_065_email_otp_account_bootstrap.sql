-- Phase 10A follow-up: support email OTP account creation without treating an
-- unverified phone number as the user's identity.
--
-- public.users historically requires phone_hash. Email-only accounts receive a
-- private, non-contact-matchable placeholder derived from their Auth user id.
-- A future verified-phone trust step can replace that placeholder with the
-- normal phone hash and unlock mutual-contact matching.

create or replace function public.ensure_my_user()
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_auth_user auth.users%rowtype;
  v_display_name text;
begin
  if v_user_id is null then
    raise exception 'Please sign in first';
  end if;

  select auth_user.*
    into v_auth_user
  from auth.users auth_user
  where auth_user.id = v_user_id;

  if not found then
    raise exception 'Authenticated account not found';
  end if;

  if v_auth_user.email_confirmed_at is null
     and v_auth_user.phone_confirmed_at is null then
    raise exception 'Verify your account before continuing';
  end if;

  v_display_name := coalesce(
    nullif(btrim(v_auth_user.raw_user_meta_data ->> 'display_name'), ''),
    'New member'
  );

  insert into public.users as existing_user (
    id,
    phone_hash,
    display_name
  )
  values (
    v_user_id,
    encode(
      digest('circles-auth-identity:' || v_user_id::text, 'sha256'),
      'hex'
    ),
    v_display_name
  )
  on conflict (id) do update
    set display_name = coalesce(
      nullif(existing_user.display_name, ''),
      excluded.display_name
    );
end;
$$;

revoke all on function public.ensure_my_user() from public;
grant execute on function public.ensure_my_user() to authenticated;
