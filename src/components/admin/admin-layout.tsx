import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, ReactNode } from "react";
import { getMyAdminRole } from "@/lib/admin.functions";
import { isNativeMobileApp, usePlatform } from "@/lib/platform";
import { BondooEyes } from "@/components/bondoo-logo";
import {
  LayoutDashboard,
  Users,
  ShieldAlert,
  CalendarCheck,
  ArrowLeft,
  FileCheck2,
  Monitor,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Lock,
  Smartphone,
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
    label: "Users & Roles",
    icon: Users,
  },
  {
    to: "/admin/verifications" as const,
    label: "ID Verifications",
    icon: FileCheck2,
  },
  {
    to: "/admin/reports" as const,
    label: "Safety & Reports",
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
  const { isNative, isMobileScreen } = usePlatform();
  const [copied, setCopied] = useState(false);

  const { data: role, isLoading: roleLoading } = useQuery({
    queryKey: ["admin-role"],
    queryFn: () => roleFn(),
  });

  useEffect(() => {
    if (!roleLoading && role && !role.canReview) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [role, roleLoading, navigate]);

  const handleCopyLink = async () => {
    try {
      const url = window.location.href;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  // 1. Loading State
  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <BondooEyes className="h-10" />
        <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">
          Verifying administrative privileges…
        </p>
      </div>
    );
  }

  // 2. Permission Denied State
  if (!role?.canReview) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-3xl bg-destructive/10 text-destructive flex items-center justify-center mb-4">
          <Lock className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-serif font-bold text-destructive">Access Restricted</h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-md">
          You do not have administrative permissions to view this control panel.
        </p>
        <Link
          to="/dashboard"
          className="mt-6 px-6 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition shadow-sm"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  // 3. Web-Only Guard: Block native mobile apps (Capacitor Android / iOS)
  if (isNative) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-paper to-background flex flex-col items-center justify-center p-6 text-center">
        <div className="w-full max-w-md bg-paper border border-border/80 rounded-3xl p-8 shadow-xl">
          <div className="mx-auto w-16 h-16 rounded-3xl bg-brand-orange/15 text-brand-orange border border-brand-orange/30 flex items-center justify-center mb-6">
            <Monitor className="w-8 h-8" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-orange/10 text-brand-orange text-[11px] font-bold uppercase tracking-wider mb-3">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Web Browser Only</span>
          </div>

          <h2 className="text-2xl font-serif font-bold text-ink tracking-tight">
            Desktop Access Required
          </h2>

          <p className="mt-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            The <strong>Bondoo Admin Control Center</strong> is exclusively accessible via desktop web browsers to ensure high security, detailed ID verification reviews, and sensitive audit compliance.
          </p>

          <div className="mt-6 p-4 rounded-2xl bg-background border border-border text-left space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              How to access:
            </p>
            <ol className="text-xs text-ink/90 space-y-1.5 list-decimal list-inside">
              <li>Open a web browser on your computer.</li>
              <li>Log in with your administrator account.</li>
              <li>Navigate to the Admin Control Center.</li>
            </ol>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleCopyLink}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-border bg-background hover:bg-paper text-ink text-xs font-semibold transition"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Link Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy Web Link</span>
                </>
              )}
            </button>

            <Link
              to="/dashboard"
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to App</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 4. Web Browser Admin Interface (Desktop Optimized)
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col antialiased selection:bg-brand-orange/20 selection:text-brand-orange">
      {/* Mobile Browser Viewport Notice */}
      {isMobileScreen && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-center text-xs text-amber-700 dark:text-amber-300 flex items-center justify-center gap-2">
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
          <span>For the best moderation &amp; review experience, please use a Desktop Web browser screen.</span>
        </div>
      )}

      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-paper/95 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <Link to="/dashboard" className="shrink-0 hover:opacity-80 transition" title="Back to Bondoo App">
                <BondooEyes className="h-7" />
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-serif font-bold text-lg tracking-tight text-ink">
                    Bondoo
                  </span>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full bg-brand-orange/15 text-brand-orange border border-brand-orange/30 flex items-center gap-1">
                    <Monitor className="w-3 h-3" />
                    Web Admin Center
                  </span>
                  {role.isAdmin && (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 hidden sm:inline-flex">
                      Super Admin
                    </span>
                  )}
                  {role.isModerator && !role.isAdmin && (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 border border-blue-500/20 hidden sm:inline-flex">
                      Moderator
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground hidden sm:block">
                  Trust, Safety &amp; Moderation HQ (Web Portal)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-background border border-border text-xs font-semibold text-muted-foreground hover:text-ink hover:border-ink/40 transition shadow-2xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Exit to App</span>
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
                  className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition shrink-0 border-b-2 ${
                    isActive
                      ? "border-brand-orange text-brand-orange bg-background shadow-xs font-bold"
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
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <span>Admin</span>
                <span>/</span>
                <span className="text-ink font-medium">{title}</span>
              </div>
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
