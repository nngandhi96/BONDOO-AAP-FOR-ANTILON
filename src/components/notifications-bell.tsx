import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell } from "lucide-react";
import { getUnreadCount } from "@/lib/notifications.functions";
import { supabase } from "@/integrations/supabase/client";

export function NotificationsBell() {
  const fetchCount = useServerFn(getUnreadCount);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => fetchCount(),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data: u }) => {
      if (!mounted || !u.user) return;
      const channel = supabase
        .channel(`notif-${u.user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${u.user.id}`,
          },
          () => {
            qc.invalidateQueries({ queryKey: ["notifications"] });
          },
        )
        .subscribe();
      (window as unknown as { __bondooNotifCh?: unknown }).__bondooNotifCh = channel;
    });
    return () => {
      mounted = false;
      const ch = (window as unknown as { __bondooNotifCh?: unknown }).__bondooNotifCh;
      if (ch) supabase.removeChannel(ch as Parameters<typeof supabase.removeChannel>[0]);
    };
  }, [qc]);

  const count = data?.count ?? 0;
  return (
    <Link
      to="/notifications"
      aria-label="Notifications"
      className="relative h-11 w-11 rounded-full bg-paper flex items-center justify-center border border-border"
    >
      <Bell size={18} strokeWidth={2} className="text-ink" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-orange text-ink text-[10px] font-semibold flex items-center justify-center border border-background">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}