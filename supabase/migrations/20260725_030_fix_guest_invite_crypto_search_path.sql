-- Circles Phase 2E.1 — guest invitation crypto search-path hotfix
--
-- Supabase commonly installs pgcrypto in the `extensions` schema. The Phase 2E
-- guest-link RPCs restricted their search_path to `public`, so
-- gen_random_bytes() and digest() could not be resolved at runtime.
--
-- Keep the already-applied Phase 2E migration immutable and correct the three
-- affected functions' runtime search paths here.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter function public.create_event_guest_invite(uuid)
  set search_path = public, extensions;

alter function public.preview_event_guest_invite(text)
  set search_path = public, extensions;

alter function public.respond_to_event_guest_invite(text, text)
  set search_path = public, extensions;
