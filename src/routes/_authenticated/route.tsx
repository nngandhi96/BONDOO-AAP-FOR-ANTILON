import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/bottom-nav";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session?.user) {
      throw redirect({
        to: "/auth",
        search: { next: location.pathname + location.searchStr },
      });
    }
    return { user: session.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Hide bottom nav on onboarding + inside a specific chat thread
  const hide =
    pathname.startsWith("/onboarding") ||
    /^\/messages\/[^/]+/.test(pathname);
  return (
    <>
      <Outlet />
      {!hide && <BottomNav />}
    </>
  );
}