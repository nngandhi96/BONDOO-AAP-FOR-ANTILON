import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, ReactNode } from "react";
import { getMyAdminRole } from "@/lib/admin.functions";
import { BondooEyes } from "@/components/bondoo-logo";
import {
  LayoutDashboard,
  Users,
  ShieldAlert,
  CalendarCheck,
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
} from "lucide-react";

interface AdminLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
}

const NAV_ITEMS = [
  {
    to: "/admin" as const,
    label: "Overview",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    to: "/admin/users" as const,
    label: "Users",
    icon: Users,
  },
  {
    to: "/admin/verifications" as const,
    label: "Verifications",
    icon: FileCheck2,
  },
  {
    to: "/admin/reports" as const,
    label: "Reports",
    icon: ShieldAlert,
  },
  {
    to: "/admin/meetups" as const,
    label: "Meetups & Activities",
    icon: CalendarCheck,
  },
];

export function AdminLayout({
  title,
  subtitle,
  children,
  actions,
}: AdminLayoutProps) {
  const navigate = useNavigate();
  const roleFn = useServerFn(getMyAdminRole);
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const { data: role, isLoading: roleLoading } = useQuery({
    queryKey: ["admin-role"],
    queryFn: () => roleFn(),
  });

  useEffect(() => {
    if (!roleLoading && role && !role.canReview) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [role, roleLoading, navigate]);

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <BondooEyes size="md" />
        <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">
          Verifying administrative privileges…
        </p>
      </div>
    );
  }

  if (!role?.canReview) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-bold text-destructive">Access Restricted</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have administrative permissions to view this control panel.
        </p>
        <Link
          to="/dashboard"
          className="mt-6 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-paper/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link to="/dashboard" className="shrink-0 hover:opacity-80 transition">
                <BondooEyes size="sm" />
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-serif font-bold text-lg tracking-tight text-ink">
                    Bondoo
                  </span>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full bg-brand-orange/15 text-brand-orange border border-brand-orange/30">
                    Admin Center
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground hidden sm:block">
                  Trust, Safety & Moderation HQ
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-background border border-border text-xs font-semibold text-muted-foreground hover:text-ink hover:border-ink/40 transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to App</span>
              </Link>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex space-x-1 overflow-x-auto pb-1 scrollbar-none">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact
                ? currentPath === item.to || currentPath === `${item.to}/`
                : currentPath.startsWith(item.to);

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold rounded-t-xl transition shrink-0 border-b-2 ${
                    isActive
                      ? "border-brand-orange text-brand-orange bg-background shadow-sm"
                      : "border-transparent text-muted-foreground hover:text-ink hover:bg-background/50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8">
          <div className="sm:flex sm:items-center sm:justify-between mb-8 pb-4 border-b border-border">
            <div>
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-ink tracking-tight">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {subtitle}
                </p>
              )}
            </div>
            {actions && <div className="mt-4 sm:mt-0 flex gap-2">{actions}</div>}
          </div>

          {children}
        </div>
      </main>
    </div>
  );
}
