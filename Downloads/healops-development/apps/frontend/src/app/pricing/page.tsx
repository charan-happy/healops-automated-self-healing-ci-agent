"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, Zap, ArrowRight, Sparkles, Building2 } from "lucide-react";
import { fetchBillingPlans } from "@/app/_libs/healops-api";
import type { BillingPlan } from "@/app/_libs/types/settings";
import { PoweredByGeekyAnts } from "@/app/_components/PoweredByGeekyAnts";

const FALLBACK_PLANS: BillingPlan[] = [
  {
    id: "free",
    name: "Free",
    slug: "free",
    priceCents: 0,
    monthlyJobLimit: 50,
    monthlyTokenBudget: 100000,
    features: [
      "50 repair jobs/month",
      "100K AI tokens",
      "GitHub Actions support",
      "3 repositories",
      "Community support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    slug: "pro",
    priceCents: 2900,
    monthlyJobLimit: 500,
    monthlyTokenBudget: 1000000,
    features: [
      "500 repair jobs/month",
      "1M AI tokens",
      "GitHub + GitLab + Jenkins",
      "Unlimited repositories",
      "AI provider fallback chain",
      "Vector memory (RAG)",
      "Slack notifications",
      "Priority support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    slug: "enterprise",
    priceCents: 9900,
    monthlyJobLimit: -1,
    monthlyTokenBudget: 10000000,
    features: [
      "Unlimited repair jobs",
      "10M AI tokens",
      "All CI providers",
      "Unlimited repositories",
      "Custom AI model config",
      "SSO / SAML",
      "Dedicated support",
      "SLA guarantee",
      "On-premise deployment",
    ],
  },
];

const PLAN_ICONS = {
  free: Zap,
  pro: Sparkles,
  enterprise: Building2,
} as const;

export default function PricingPage() {
  const [plans, setPlans] = useState<BillingPlan[]>(FALLBACK_PLANS);

  useEffect(() => {
    async function loadPlans() {
      const fetched = await fetchBillingPlans();
      if (fetched && fetched.length > 0) {
        setPlans(fetched);
      }
    }
    loadPlans();
  }, []);

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden p-6">
      {/* Animated background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 top-1/4 size-[600px] animate-pulse rounded-full bg-brand-cyan/[0.05] blur-[150px]" />
        <div className="absolute -right-40 bottom-1/4 size-[500px] animate-pulse rounded-full bg-brand-primary/[0.05] blur-[120px] [animation-delay:1.5s]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-6xl space-y-14"
      >
        {/* Header */}
        <div className="text-center">
          <Link href="/login" className="mb-8 inline-flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-cyan to-brand-primary shadow-xl shadow-brand-cyan/25">
              <Zap className="size-5.5 text-white" />
            </div>
            <span className="text-2xl font-black tracking-tight text-gradient">
              HealOps
            </span>
          </Link>
          <h1 className="text-5xl font-bold tracking-tight">
            Simple,{" "}
            <span className="bg-gradient-to-r from-brand-cyan to-emerald-400 bg-clip-text text-transparent">
              transparent
            </span>{" "}
            pricing
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Start free and scale as your team grows. Every plan includes our
            autonomous CI/CD repair agent with multi-language support.
          </p>
        </div>

        {/* Plans grid */}
        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((plan, i) => {
            const isPopular = plan.slug === "pro";
            const PlanIcon = PLAN_ICONS[plan.slug as keyof typeof PLAN_ICONS] ?? Zap;
            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.12 }}
                className={`group relative flex flex-col rounded-2xl border p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl ${
                  isPopular
                    ? "border-brand-cyan/50 bg-gradient-to-b from-brand-cyan/[0.08] to-transparent shadow-xl shadow-brand-cyan/10"
                    : "border-white/[0.08] bg-card/40 backdrop-blur-sm hover:border-white/[0.15]"
                }`}
              >
                {isPopular && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-cyan to-emerald-400 px-4 py-1 text-xs font-bold text-black shadow-lg shadow-brand-cyan/30">
                    Most Popular
                  </span>
                )}

                <div className="mb-6">
                  <div className="mb-4 flex items-center gap-3">
                    <div className={`flex size-10 items-center justify-center rounded-xl ${
                      isPopular
                        ? "bg-brand-cyan/15 text-brand-cyan"
                        : "bg-white/[0.06] text-muted-foreground"
                    }`}>
                      <PlanIcon className="size-5" />
                    </div>
                    <h3 className="text-lg font-bold">{plan.name}</h3>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-extrabold tracking-tight">
                      {plan.priceCents === 0
                        ? "$0"
                        : `$${(plan.priceCents / 100).toFixed(0)}`}
                    </span>
                    <span className="text-sm text-muted-foreground">/mo</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {plan.monthlyJobLimit === -1
                      ? "Unlimited repair jobs"
                      : `Up to ${plan.monthlyJobLimit} repairs/month`}
                  </p>
                </div>

                <ul className="mb-8 flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm">
                      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-cyan/15">
                        <Check className="size-3 text-brand-cyan" />
                      </div>
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/register"
                  className={`relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl px-4 py-3 text-sm font-bold transition-all ${
                    isPopular
                      ? "bg-gradient-to-r from-brand-cyan to-brand-cyan/80 text-black shadow-lg shadow-brand-cyan/25 hover:shadow-xl hover:shadow-brand-cyan/35"
                      : "border border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                  }`}
                >
                  {isPopular && (
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-btn-shine" />
                  )}
                  {plan.priceCents === 0 ? "Get Started Free" : "Start Free Trial"}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </motion.div>
            );
          })}
        </div>

        {/* Trust bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="flex flex-col items-center gap-6"
        >
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground/60">
            <span className="flex items-center gap-1.5">
              <Check className="size-3.5 text-emerald-400" /> 14-day free trial
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="size-3.5 text-emerald-400" /> No credit card required
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="size-3.5 text-emerald-400" /> Cancel anytime
            </span>
          </div>

          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-brand-cyan hover:underline">
              Sign in
            </Link>
          </p>

          <PoweredByGeekyAnts className="mt-2" />
        </motion.div>
      </motion.div>
    </div>
  );
}
