import { Link, useRouterState } from "@tanstack/react-router";
import { Home, MessageCircle, User } from "lucide-react";

const TABS = [
  { to: "/dashboard", label: "Home", icon: Home },
  { to: "/messages", label: "Chat", icon: MessageCircle },
  { to: "/profile", label: "You", icon: User },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="fixed bottom-0 inset-x-0 z-20 bg-background/95 backdrop-blur border-t border-border">
      <ul className="max-w-md mx-auto grid grid-cols-3">
        {TABS.map((t) => {
          const active =
            t.to === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(t.to);
          const Icon = t.icon;
          return (
            <li key={t.to}>
              <Link
                to={t.to}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                  active ? "text-ink" : "text-muted-foreground"
                }`}
              >
                <Icon
                  size={22}
                  strokeWidth={active ? 2.4 : 1.8}
                  className={active ? "text-brand-orange" : ""}
                />
                <span className={active ? "display italic" : ""}>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}