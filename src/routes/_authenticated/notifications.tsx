import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications.functions";
import { BottomNav } from "@/components/bottom-nav";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications · Bondoo" },
      { name: "description", content: "Your Bondoo activity — messages, connections, and meetups." },
    ],
  }),
  component: NotificationsPage,
});

const TYPE_EMOJI: Record<string, string> = {
  message: "💬",
  connection_request: "🤝",
  connection_accepted: "✨",
  meetup_proposal: "📍",
  meetup_confirmed: "✅",
};

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function NotificationsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchList = useServerFn(listMyNotifications);
  const markOne = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);

  const { data = [], isLoading } = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => fetchList(),
  });

  const markAllMut = useMutation({
    mutationFn: () => markAll({}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const handleOpen = async (id: string, link: string | null) => {
    try {
      await markOne({ data: { id } });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    } catch {
      /* ignore */
    }
    if (link) navigate({ to: link as never });
  };

  const unread = data.filter((n) => !n.read).length;

  return (
    <main className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-md mx-auto px-6 py-4 flex items-center gap-3">
          <Link
            to="/dashboard"
            className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold hover:text-ink"
          >
            ← Home
          </Link>
          <p className="flex-1 text-center text-[10px] uppercase tracking-[0.22em] font-semibold text-brand-orange">
            Notifications
          </p>
          <button
            onClick={() => markAllMut.mutate()}
            disabled={unread === 0 || markAllMut.isPending}
            className="text-[10px] uppercase tracking-[0.22em] font-semibold text-primary disabled:text-muted-foreground disabled:opacity-50"
          >
            {unread > 0 ? "Mark all" : "All read"}
          </button>
        </div>
      </header>

      <div className="max-w-md mx-auto px-6 pt-6">
        <h1 className="display text-3xl text-ink leading-tight">
          What's <em className="text-primary not-italic">new</em>
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          {unread === 0 ? "You're all caught up." : `${unread} unread`}
        </p>

        {isLoading ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : data.length === 0 ? (
          <div className="mt-16 text-center">
            <p className="display text-2xl text-ink">Nothing yet</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Say hi to someone — updates will land here.
            </p>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-border border-y border-border">
            {data.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => handleOpen(n.id, n.link)}
                  className={`w-full text-left py-4 flex gap-3 items-start hover:bg-paper/60 transition -mx-2 px-2 rounded-xl ${
                    !n.read ? "bg-primary/5" : ""
                  }`}
                >
                  <span className="text-2xl leading-none pt-0.5">
                    {TYPE_EMOJI[n.type] ?? "🔔"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink font-medium leading-snug">{n.title}</p>
                    {n.body && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.body}</p>
                    )}
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">
                      {timeAgo(n.created_at)}
                    </p>
                  </div>
                  {!n.read && (
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-brand-orange" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <BottomNav />
    </main>
  );
}