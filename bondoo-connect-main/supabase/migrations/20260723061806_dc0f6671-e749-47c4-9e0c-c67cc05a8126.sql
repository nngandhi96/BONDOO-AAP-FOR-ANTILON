
-- Revoke EXECUTE from signed-in users on SECURITY DEFINER trigger functions.
-- These are only invoked internally by triggers (which run as table owner)
-- and should not be callable directly by anon/authenticated roles.

REVOKE EXECUTE ON FUNCTION public.notify_on_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_conversation_last_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_reviewee_stats() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_meetup() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_connection() FROM PUBLIC, anon, authenticated;

-- is_blocked_between is used inside RLS policies evaluated by the authenticated
-- role, so it must remain executable by authenticated. Keep it as-is.
