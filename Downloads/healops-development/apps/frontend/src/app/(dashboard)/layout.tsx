"use client";

import { Suspense, useState } from "react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/app/_components/AppSidebar";
import AppBreadcrumb from "@/app/_components/AppBreadcrumb";
import { Heart, AlertTriangle, Loader2, X } from "lucide-react";
import { useAuth } from "@/app/_libs/context/AuthContext";
import { resendVerificationApi } from "@/app/_libs/healops-api";

const contributors = [
  { name: "Deepanshu Goyal", gradient: "from-cyan-400 via-emerald-400 to-teal-300" },
  { name: "Jahnavi Sardana", gradient: "from-violet-400 via-purple-400 to-fuchsia-400" },
  { name: "Nagacharan Gudiyatham", gradient: "from-amber-400 via-orange-400 to-rose-400" },
  { name: "Ashish Gour", gradient: "from-sky-400 via-blue-400 to-indigo-400" },
  { name: "Vikas Goyal", gradient: "from-emerald-400 via-green-400 to-lime-400" },
];

function EmailVerificationBanner() {
  const { user, isEmailVerified } = useAuth();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Don't show for demo users, verified users, or dismissed
  if (!user || isEmailVerified || user.email === "demo@healops.dev" || dismissed) return null;

  const handleResend = async () => {
    setSending(true);
    try {
      await resendVerificationApi(user.email);
      setSent(true);
    } catch {
      // silently fail
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-500/20 bg-amber-500/5 px-6 py-2.5">
      <div className="flex items-center gap-2 text-sm">
        <AlertTriangle className="size-4 shrink-0 text-amber-400" />
        <span className="text-amber-300">
          Please verify your email address.
        </span>
        {sent ? (
          <span className="text-xs text-emerald-400">Verification email sent!</span>
        ) : (
          <button
            onClick={handleResend}
            disabled={sending}
            className="text-xs font-semibold text-brand-cyan hover:underline disabled:opacity-50"
          >
            {sending ? <Loader2 className="inline size-3 animate-spin" /> : "Resend email"}
          </button>
        )}
      </div>
      <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground">
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider defaultOpen={false} className="h-screen overflow-hidden">
      <AppSidebar />
      <SidebarInset className="!min-h-0 min-w-0 h-full flex flex-col overflow-hidden">
        <header className="z-20 flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-card/80 backdrop-blur-xl px-6">
          <SidebarTrigger className="-ml-1 size-7 text-muted-foreground hover:text-foreground" />
          <Separator orientation="vertical" className="mr-2 h-4 bg-white/10" />
          <Suspense fallback={null}>
            <AppBreadcrumb />
          </Suspense>
        </header>
        <EmailVerificationBanner />
        <div className="relative flex-1 overflow-y-auto overflow-x-hidden bg-grid-pattern">
          {children}

          {/* ─── Contributors Footer ─── */}
          <footer className="border-t border-white/[0.06] px-6 py-6">
            <div className="mx-auto max-w-5xl">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 backdrop-blur-sm">
                <div className="mb-3 flex items-center justify-center gap-2">
                  <Heart className="size-3.5 text-rose-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Built with passion by
                  </span>
                  <Heart className="size-3.5 text-rose-400" />
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {contributors.map((c) => (
                    <span
                      key={c.name}
                      className={`inline-block rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-bold bg-gradient-to-r ${c.gradient} bg-clip-text text-transparent transition-all hover:scale-105 hover:border-white/[0.15] hover:bg-white/[0.08] hover:shadow-lg`}
                    >
                      {c.name}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-center text-[10px] text-muted-foreground/40">
                  &copy; {new Date().getFullYear()} HealOps &mdash; Autonomous Pipeline Healing
                </p>
              </div>
            </div>
          </footer>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
