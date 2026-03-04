"use client";

import { useEffect, useState } from "react";
import { CreditCard, ArrowUpRight, Check, Loader2 } from "lucide-react";
import {
  fetchBillingPlans,
  fetchSubscription,
  fetchUsageStats,
  createCheckoutSession,
  createPortalSession,
} from "@/app/_libs/healops-api";
import { trackEvent, POSTHOG_EVENTS } from "@/app/_libs/utils/analytics";
import type {
  BillingPlan,
  Subscription,
  UsageStats,
} from "@/app/_libs/types/settings";

function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all ${
            pct > 90 ? "bg-red-400" : pct > 70 ? "bg-yellow-400" : "bg-brand-cyan"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function BillingPage() {
  const [plans, setPlans] = useState<BillingPlan[] | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchBillingPlans(),
      fetchSubscription(),
      fetchUsageStats(),
    ])
      .then(([p, s, u]) => {
        setPlans(p);
        setSubscription(s);
        setUsage(u);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-brand-cyan" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Billing</h2>
          <p className="text-sm text-muted-foreground">
            Manage your plan and monitor usage
          </p>
        </div>
        {process.env.NEXT_PUBLIC_STRIPE_MODE === "test" && (
          <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-1 text-xs font-semibold text-yellow-400">
            Test Mode
          </span>
        )}
      </div>

      {/* Current plan & usage */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <h3 className="mb-4 text-sm font-semibold">Current Plan</h3>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-brand-cyan/10 p-2.5">
              <CreditCard className="size-5 text-brand-cyan" />
            </div>
            <div>
              <p className="text-lg font-bold">
                {subscription?.plan.name ?? "Free"}
              </p>
              <p className="text-xs text-muted-foreground">
                {subscription?.status === "active"
                  ? "Active"
                  : subscription?.status ?? "Active"}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <h3 className="mb-4 text-sm font-semibold">Usage This Month</h3>
          <div className="space-y-3">
            <UsageBar
              used={usage?.jobsUsed ?? 0}
              limit={usage?.jobsLimit ?? 100}
              label="Repair Jobs"
            />
            <UsageBar
              used={usage?.tokensUsed ?? 0}
              limit={usage?.tokensLimit ?? 1000000}
              label="AI Tokens"
            />
          </div>
        </div>
      </div>

      {/* Plans */}
      <div>
        <h3 className="mb-4 text-sm font-semibold">Available Plans</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {(plans ?? []).map((plan) => {
            const isCurrent = subscription?.plan.slug === plan.slug;
            return (
              <div
                key={plan.id}
                className={`rounded-xl border p-6 transition-all ${
                  isCurrent
                    ? "border-brand-cyan bg-brand-cyan/5"
                    : "border-white/10 bg-white/5 hover:border-white/20"
                }`}
              >
                <p className="text-sm font-semibold">{plan.name}</p>
                <p className="mt-1 text-2xl font-bold">
                  ${(plan.priceCents / 100).toFixed(0)}
                  <span className="text-sm font-normal text-muted-foreground">
                    /mo
                  </span>
                </p>
                <ul className="mt-4 space-y-2">
                  <li className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="size-3 text-emerald-400" />
                    {plan.monthlyJobLimit.toLocaleString()} repair jobs/mo
                  </li>
                  <li className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="size-3 text-emerald-400" />
                    {(plan.monthlyTokenBudget / 1_000_000).toFixed(0)}M AI tokens/mo
                  </li>
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <Check className="size-3 text-emerald-400" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  disabled={isCurrent}
                  onClick={async () => {
                    if (isCurrent) return;
                    trackEvent(POSTHOG_EVENTS.CHECKOUT_STARTED, { plan: plan.slug });
                    const result = await createCheckoutSession(
                      plan.slug,
                      `${window.location.origin}/settings/billing?success=true`,
                      `${window.location.origin}/settings/billing`,
                    );
                    if (result?.url) {
                      window.location.href = result.url;
                    }
                  }}
                  className={`mt-5 w-full rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                    isCurrent
                      ? "cursor-default bg-brand-cyan/10 text-brand-cyan"
                      : "bg-brand-cyan text-black hover:bg-brand-cyan/90"
                  }`}
                >
                  {isCurrent ? "Current Plan" : "Upgrade"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Manage billing */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Manage Billing</h3>
            <p className="text-xs text-muted-foreground">
              View invoices, update payment method, or cancel subscription
            </p>
          </div>
          <button
            onClick={async () => {
              const result = await createPortalSession(
                `${window.location.origin}/settings/billing`,
              );
              if (result?.url) {
                window.location.href = result.url;
              }
            }}
            className="flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-white/5"
          >
            Stripe Portal
            <ArrowUpRight className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
