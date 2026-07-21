-- Circles Step 9A.1 — groups begin as pinned Circles
--
-- A private group is an intentional Circle, so each accepted member should see
-- it in the pinned circular area by default. Pinning remains a per-user
-- preference: members may still long-press and unpin the conversation later.

create or replace function public.default_pin_group_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.conversations conversation
    where conversation.id = new.conversation_id
      and conversation.kind = 'group'
  ) then
    new.is_pinned := true;
  end if;

  return new;
end;
$$;

revoke all on function public.default_pin_group_membership() from public;

drop trigger if exists conversation_members_default_group_pin
  on public.conversation_members;

create trigger conversation_members_default_group_pin
before insert on public.conversation_members
for each row
execute function public.default_pin_group_membership();

-- Bring groups created during Step 9A into the same default presentation.
-- This is a one-time backfill; users can unpin them normally afterward.
update public.conversation_members member
set is_pinned = true
from public.conversations conversation
where conversation.id = member.conversation_id
  and conversation.kind = 'group'
  and member.is_pinned = false;
