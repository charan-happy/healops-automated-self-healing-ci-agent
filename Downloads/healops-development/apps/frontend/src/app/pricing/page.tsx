"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, Zap, ArrowRight } from "lucide-react";
import { fetchBillingPlans } from "@/app/_libs/healops-api";
import type { BillingPlan } from "@/app/_libs/types/settings";

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
    <div className="flex min-h-screen w-full flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-5xl space-y-12"
      >
        {/* Header */}
        <div className="text-center">
          <Link href="/login" className="mb-6 inline-flex items-center gap-2">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-cyan to-brand-primary shadow-lg shadow-brand-cyan/20">
              <Zap className="size-5 text-white" />
            </div>
            <span className="text-xl font-black tracking-tight text-gradient">
              HealOps
            </span>
          </Link>
          <h1 className="text-4xl font-bold tracking-tight">
            Simple, transparent pricing
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            Start free and scale as your team grows. Every plan includes our
            autonomous CI/CD repair agent with multi-language support.
          </p>
        </div>

        {/* Plans grid */}
        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((plan, i) => {
            const isPopular = plan.slug === "pro";
            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`relative rounded-2xl border p-8 transition-all ${
                  isPopular
                    ? "border-brand-cyan bg-brand-cyan/5 shadow-lg shadow-brand-cyan/10"
                    : "border-white/10 bg-white/5"
                }`}
              >
                {isPopular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-cyan px-3 py-1 text-xs font-bold text-black">
                    Most Popular
                  </span>
                )}

                <div className="mb-6">
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-4xl font-bold">
                      {plan.priceCents === 0
                        ? "$0"
                        : `$${(plan.priceCents / 100).toFixed(0)}`}
                    </span>
                    <span className="text-sm text-muted-foreground">/month</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {plan.monthlyJobLimit === -1
                      ? "Unlimited repair jobs"
                      : `${plan.monthlyJobLimit} repair jobs/month`}
                  </p>
                </div>

                <ul className="mb-8 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-brand-cyan" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/register"
                  className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                    isPopular
                      ? "bg-brand-cyan text-black hover:bg-brand-cyan/90"
                      : "border border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  {plan.priceCents === 0 ? "Get Started Free" : "Start Free Trial"}
                  <ArrowRight className="size-4" />
                </Link>
              </motion.div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            All plans include a 14-day free trial. No credit card required.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-brand-cyan hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
