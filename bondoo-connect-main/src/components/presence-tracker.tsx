import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { setPresenceOnline } from "@/lib/presence-store";

/**
 * Global online-presence tracker. Mounts once (client-only) and joins the
 * `presence:global` channel with the current user's id whenever they are
 * signed in. Any other page can read this channel to know who is online.
 */
export function PresenceTracker() {
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let currentUserId: string | null = null;
    let cancelled = false;

    const join = async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      if (cancelled) return;
      if (uid === currentUserId) return;
      // Tear down previous channel (user changed / signed out)
      if (channel) {
        try {
          await channel.untrack();
        } catch {
          /* ignore */
        }
        supabase.removeChannel(channel);
        channel = null;
      }
      currentUserId = uid;
      if (!uid) return;
      const ch = supabase.channel("presence:global", {
        config: { presence: { key: uid } },
      });
      const compute = () => {
        const state = ch.presenceState() as Record<
          string,
          Array<{ userId?: string }>
        >;
        const next = new Set<string>();
        for (const [key, arr] of Object.entries(state)) {
          if (key) next.add(key);
          for (const p of arr) if (p.userId) next.add(p.userId);
        }
        setPresenceOnline(next);
      };
      ch.on("presence", { event: "sync" }, compute)
        .on("presence", { event: "join" }, compute)
        .on("presence", { event: "leave" }, compute);
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void ch.track({ userId: uid, at: new Date().toISOString() });
        }
      });
      channel = ch;
    };

    void join();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void join();
      }
    });

    const onVisibility = () => {
      if (document.visibilityState === "visible") void join();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      sub.subscription.unsubscribe();
      if (channel) {
        void channel.untrack();
        supabase.removeChannel(channel);
      }
      setPresenceOnline(new Set());
    };
  }, []);

  return null;
}