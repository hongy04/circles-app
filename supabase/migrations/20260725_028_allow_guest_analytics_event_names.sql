-- Phase 2D hotfix: extend the analytics table CHECK constraint to accept
-- the outside-guest event names already allowlisted by track_app_event and
-- recorded by the server-side guest RPCs.
--
-- The prior migrations updated the tracking function but left the table
-- constraint at the Phase 2B event-name list, causing guest analytics inserts
-- to fail while best-effort error handling kept guest actions successful.

alter table public.app_analytics_events
  drop constraint if exists app_analytics_event_name_check;

alter table public.app_analytics_events
  add constraint app_analytics_event_name_check check (
    event_name in (
      'invite_created',
      'invite_share_opened',
      'invite_previewed',
      'invite_redeemed',
      'mutuals_opened',
      'mutual_preview_updated',
      'preconnection_profile_opened',
      'connection_request_sent',
      'connection_request_responded',
      'circle_member_invites_sent',
      'event_created',
      'event_opened',
      'event_rsvp_updated',
      'event_poll_created',
      'event_poll_opened',
      'event_poll_response_updated',
      'event_poll_finalized',
      'event_guest_added',
      'event_guest_response_updated',
      'event_guest_removed',
      'event_guest_settings_updated'
    )
  );
