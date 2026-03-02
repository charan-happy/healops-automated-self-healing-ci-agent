"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useState } from "react";
import {
  Zap,
  ArrowRight,
  GitBranch,
  Bot,
  Shield,
  Clock,
  BarChart3,
  Check,
  ChevronRight,
  Loader2,
  Mail,
  Heart,
} from "lucide-react";

const FEATURES = [
  {
    icon: Bot,
    title: "AI-Powered Auto-Fix",
    description:
      "When your CI pipeline fails, HealOps diagnoses the error, generates a fix, and opens a draft PR — all within minutes.",
  },
  {
    icon: GitBranch,
    title: "Multi-CI Provider",
    description:
      "Works with GitHub Actions, GitLab CI/CD, Jenkins, and Bitbucket Pipelines. Use multiple providers simultaneously.",
  },
  {
    icon: Shield,
    title: "Quality Gates",
    description:
      "15 deterministic validation rules + compile checks ensure fixes are safe before any PR is created. Never auto-merges.",
  },
  {
    icon: Clock,
    title: "RAG Memory",
    description:
      "Learns from past fixes using vector similarity search. The more you use it, the smarter and faster it gets.",
  },
  {
    icon: BarChart3,
    title: "Cost Tracking",
    description:
      "Per-job token budgets prevent runaway LLM costs. Full visibility into AI spend per repository.",
  },
  {
    icon: Zap,
    title: "Instant Notifications",
    description:
      "Slack alerts when fixes are ready. Know immediately when your pipeline is healed.",
  },
];

const STATS = [
  { value: "85%", label: "Auto-fix success rate" },
  { value: "<3 min", label: "Average repair time" },
  { value: "15", label: "Quality gate rules" },
  { value: "3", label: "Retry attempts" },
];

const HOW_IT_WORKS = [
  {
    step: "1",
    title: "Pipeline Fails",
    description: "Your CI pipeline fails on a commit. HealOps receives a webhook notification.",
  },
  {
    step: "2",
    title: "AI Diagnoses",
    description: "The agent parses logs, classifies the error, and fetches relevant source code from your repo.",
  },
  {
    step: "3",
    title: "Fix Generated",
    description: "LLM generates a fix using your code context, similar past fixes (RAG), and language-specific rules.",
  },
  {
    step: "4",
    title: "Draft PR Created",
    description: "After passing quality gates and compile checks, a draft PR is created for your team to review.",
  },
];

export default function LandingPage() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      {/* Animated background blobs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 top-20 size-[600px] animate-pulse rounded-full bg-brand-cyan/[0.04] blur-[150px]" />
        <div className="absolute -right-40 top-1/3 size-[500px] animate-pulse rounded-full bg-brand-primary/[0.04] blur-[120px] [animation-delay:2s]" />
        <div className="absolute bottom-0 left-1/3 size-[400px] animate-pulse rounded-full bg-emerald-500/[0.03] blur-[100px] [animation-delay:4s]" />
      </div>

      {/* ─── Nav ─────────────────────────────────────────────────────── */}
      <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-cyan to-brand-primary shadow-lg shadow-brand-cyan/20">
            <Zap className="size-5 text-white" />
          </div>
          <span className="text-xl font-black tracking-tight text-gradient">HealOps</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/pricing"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Pricing
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-brand-cyan px-4 py-2 text-sm font-bold text-black transition-all hover:bg-brand-cyan/90 shadow-lg shadow-brand-cyan/20"
          >
            Start Free
          </Link>
        </div>
      </nav>

      {/* ─── Hero ────────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 pt-20 pb-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-cyan/20 bg-brand-cyan/5 px-4 py-1.5 text-xs font-semibold text-brand-cyan">
            <Zap className="size-3.5" />
            Autonomous CI/CD Repair Agent
          </div>

          <h1 className="text-5xl font-extrabold leading-tight tracking-tight sm:text-6xl md:text-7xl">
            Your CI pipeline{" "}
            <span className="bg-gradient-to-r from-brand-cyan via-emerald-400 to-brand-cyan bg-clip-text text-transparent">
              breaks
            </span>
            .
            <br />
            We{" "}
            <span className="bg-gradient-to-r from-brand-cyan via-emerald-400 to-brand-cyan bg-clip-text text-transparent">
              fix it
            </span>
            .
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
            HealOps is an AI agent that monitors your CI/CD pipelines, diagnoses
            failures, and opens draft PRs with fixes — automatically. Stop
            wasting hours debugging build errors.
          </p>

          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/register"
              className="group flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-cyan to-brand-cyan/80 px-8 py-3.5 text-sm font-bold text-black shadow-xl shadow-brand-cyan/25 transition-all hover:shadow-2xl hover:shadow-brand-cyan/30"
            >
              Start Free — No Credit Card
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/pricing"
              className="flex items-center gap-1 rounded-xl border border-white/10 px-6 py-3.5 text-sm font-medium transition-all hover:bg-white/5"
            >
              View Pricing
              <ChevronRight className="size-4" />
            </Link>
          </div>
        </motion.div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-6 sm:grid-cols-4"
        >
          {STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-3xl font-extrabold text-brand-cyan">{stat.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ─── How It Works ────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-24">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <h2 className="text-3xl font-bold sm:text-4xl">
            How{" "}
            <span className="text-brand-cyan">HealOps</span>{" "}
            works
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            From pipeline failure to fix PR in under 3 minutes
          </p>
        </motion.div>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((item, i) => (
            <motion.div
              key={item.step}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              viewport={{ once: true }}
              className="relative rounded-xl border border-white/[0.06] bg-card/40 p-6 backdrop-blur-sm"
            >
              <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-brand-cyan/10 text-lg font-extrabold text-brand-cyan">
                {item.step}
              </div>
              <h3 className="mb-2 text-sm font-bold">{item.title}</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── Features ────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-24">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <h2 className="text-3xl font-bold sm:text-4xl">
            Built for{" "}
            <span className="text-brand-cyan">production</span>{" "}
            teams
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Enterprise-grade safety with startup-speed automation
          </p>
        </motion.div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              viewport={{ once: true }}
              className="group rounded-xl border border-white/[0.06] bg-card/40 p-6 backdrop-blur-sm transition-all hover:border-brand-cyan/20 hover:shadow-lg hover:shadow-brand-cyan/5"
            >
              <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-brand-cyan/10">
                <feature.icon className="size-5 text-brand-cyan" />
              </div>
              <h3 className="mb-2 text-sm font-bold">{feature.title}</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── CTA ─────────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-3xl px-6 py-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="rounded-2xl border border-brand-cyan/20 bg-gradient-to-b from-brand-cyan/[0.06] to-transparent p-12"
        >
          <h2 className="text-3xl font-bold">
            Stop firefighting CI failures
          </h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            Join teams who save hours every week with autonomous pipeline repair.
            Start free, upgrade when you need to.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link
              href="/register"
              className="group flex items-center gap-2 rounded-xl bg-brand-cyan px-8 py-3 text-sm font-bold text-black shadow-lg shadow-brand-cyan/25 transition-all hover:shadow-xl"
            >
              Get Started Free
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground/60">
            <span className="flex items-center gap-1.5">
              <Check className="size-3.5 text-emerald-400" /> Free tier available
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="size-3.5 text-emerald-400" /> No credit card required
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="size-3.5 text-emerald-400" /> Cancel anytime
            </span>
          </div>
        </motion.div>
      </section>

      {/* ─── Beta Signup ────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-xl px-6 pb-24" id="beta">
        <BetaSignupForm />
      </section>

      {/* ─── Footer ──────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/[0.06] pt-12 pb-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 px-6">
          {/* Nav row */}
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-cyan to-brand-primary">
                <Zap className="size-3.5 text-white" />
              </div>
              <span className="text-sm font-bold text-gradient">HealOps</span>
            </div>
            <div className="flex items-center gap-6 text-xs text-muted-foreground">
              <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
              <Link href="/login" className="hover:text-foreground transition-colors">Sign In</Link>
              <Link href="/register" className="hover:text-foreground transition-colors">Register</Link>
            </div>
          </div>

          {/* Contributors showcase */}
          <div className="w-full rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent p-6 backdrop-blur-sm">
            <div className="mb-4 flex items-center justify-center gap-2">
              <Heart className="size-4 text-rose-400" />
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Built with passion by
              </span>
              <Heart className="size-4 text-rose-400" />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {[
                { name: "Deepanshu Goyal", gradient: "from-brand-cyan via-emerald-400 to-teal-300" },
                { name: "Jahnavi Sardana", gradient: "from-violet-400 via-purple-400 to-fuchsia-400" },
                { name: "Nagacharan Gudiyatham", gradient: "from-amber-400 via-orange-400 to-rose-400" },
                { name: "Ashish Gour", gradient: "from-sky-400 via-blue-400 to-indigo-400" },
                { name: "Vikas Goyal", gradient: "from-emerald-400 via-green-400 to-lime-400" },
              ].map((contributor) => (
                <span
                  key={contributor.name}
                  className={`inline-block rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-1.5 text-sm font-bold bg-gradient-to-r ${contributor.gradient} bg-clip-text text-transparent transition-all hover:scale-105 hover:border-white/[0.15] hover:bg-white/[0.08] hover:shadow-lg`}
                >
                  {contributor.name}
                </span>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground/40">
            &copy; {new Date().getFullYear()} HealOps &mdash; Autonomous Pipeline Healing
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ─── Beta Signup Form ──────────────────────────────────────────────────────── */

function BetaSignupForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"}/v1/healops/beta/signup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, name, company }),
        },
      );

      if (!res.ok) throw new Error("Signup failed");
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center"
      >
        <Check className="mx-auto mb-3 size-8 text-emerald-400" />
        <h3 className="text-lg font-bold">You&apos;re on the list!</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          We&apos;ll reach out when your spot is ready.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="rounded-2xl border border-white/[0.06] bg-card/40 p-8 backdrop-blur-sm"
    >
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-xl bg-brand-cyan/10">
          <Mail className="size-5 text-brand-cyan" />
        </div>
        <h3 className="text-lg font-bold">Join the Beta</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Get early access and help shape the product.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          required
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-background/60 px-4 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:border-brand-cyan/40 focus:outline-none focus:ring-1 focus:ring-brand-cyan/40"
        />
        <input
          type="text"
          placeholder="Your name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-background/60 px-4 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:border-brand-cyan/40 focus:outline-none focus:ring-1 focus:ring-brand-cyan/40"
        />
        <input
          type="text"
          placeholder="Company (optional)"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-background/60 px-4 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:border-brand-cyan/40 focus:outline-none focus:ring-1 focus:ring-brand-cyan/40"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading || !email}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-cyan px-4 py-2.5 text-sm font-bold text-black transition-all hover:bg-brand-cyan/90 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              Join Beta Waitlist
              <ArrowRight className="size-4" />
            </>
          )}
        </button>
      </form>
    </motion.div>
  );
}
