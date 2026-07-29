-- Phase 9B hotfix: make the blocked-pair connection-request trigger
-- independent of the concrete labels present in connection_status.
--
-- The prior function compared NEW.status directly with the literal
-- 'cancelled'. When status is an enum that does not contain that label,
-- PostgreSQL attempts to cast the literal to the enum before evaluating the
-- row and rejects every insert/update with:
--   invalid input value for enum connection_status: "cancelled"
--
-- Cast the row status to text first. This preserves the intended behavior
-- for terminal request states without requiring a specific enum label.

create or replace function public.reject_blocked_connection_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := coalesce(new.status::text, 'pending');
begin
  if public.user_pair_is_blocked(new.from_user, new.to_user)
     and v_status not in ('declined', 'cancelled', 'canceled') then
    raise exception 'Interaction unavailable';
  end if;

  return new;
end;
$$;
