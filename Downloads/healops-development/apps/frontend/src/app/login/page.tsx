"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Github, Shield, Activity, GitPullRequest, Zap } from "lucide-react";
import { useAuth } from "@/app/_libs/context/AuthContext";
import { fetchAuthProviders, type AuthProviders } from "@/app/_libs/healops-api";
import { PoweredByGeekyAnts } from "@/app/_components/PoweredByGeekyAnts";
import { HealOpsLogo } from "@/app/_components/HealOpsLogo";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

const FEATURES = [
  { icon: Activity, label: "Auto-detect CI failures in real-time" },
  { icon: GitPullRequest, label: "AI generates & ships PRs autonomously" },
  { icon: Shield, label: "Multi-provider fallback with circuit breakers" },
];

export default function LoginPage() {
  const router = useRouter();
  const { login, demoLogin } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<AuthProviders | null>(null);

  useEffect(() => {
    fetchAuthProviders().then(setProviders);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full overflow-hidden">
      {/* Animated background orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 size-[500px] animate-pulse rounded-full bg-brand-cyan/[0.07] blur-[120px]" />
        <div className="absolute -bottom-32 -right-32 size-[400px] animate-pulse rounded-full bg-brand-primary/[0.07] blur-[120px] [animation-delay:1s]" />
        <div className="absolute left-1/2 top-1/2 size-[300px] -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-purple-500/[0.04] blur-[100px] [animation-delay:2s]" />
      </div>

      {/* Left panel — branding & features */}
      <div className="hidden flex-1 flex-col justify-between p-12 lg:flex">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-center gap-3">
            <HealOpsLogo size={48} className="shadow-xl shadow-brand-cyan/25 rounded-2xl" />
            <div>
              <h2 className="text-2xl font-black tracking-tight text-gradient">HealOps</h2>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Autonomous CI/CD Healing
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="max-w-md space-y-8"
        >
          <div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight">
              Your pipelines{" "}
              <span className="bg-gradient-to-r from-brand-cyan to-emerald-400 bg-clip-text text-transparent">
                heal themselves.
              </span>
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Stop firefighting broken builds. HealOps detects failures,
              diagnoses root causes, and ships fixes — automatically.
            </p>
          </div>

          <div className="space-y-4">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.label}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.15 }}
                className="flex items-center gap-3"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-brand-cyan/20 bg-brand-cyan/10">
                  <f.icon className="size-4 text-brand-cyan" />
                </div>
                <span className="text-sm text-muted-foreground">{f.label}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          <PoweredByGeekyAnts />
        </motion.div>
      </div>

      {/* Right panel — login form */}
      <div className="flex flex-1 items-center justify-center p-6 lg:p-12">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-[420px] space-y-7"
        >
          {/* Mobile logo */}
          <div className="text-center lg:hidden">
            <HealOpsLogo size={56} className="mx-auto shadow-lg shadow-brand-cyan/20 rounded-2xl" />
            <h1 className="mt-4 text-2xl font-bold tracking-tight">HealOps</h1>
          </div>

          {/* Card */}
          <div className="rounded-2xl border border-white/[0.08] bg-card/50 p-8 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <div className="mb-6">
              <h2 className="text-xl font-bold tracking-tight">Welcome back</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Sign in to your HealOps account
              </p>
            </div>

            {/* OAuth buttons — only shown if providers are configured */}
            {providers && (providers.github || providers.google) && (
              <>
                <div className={`grid gap-3 ${providers.github && providers.google ? "grid-cols-2" : "grid-cols-1"}`}>
                  {providers.github && (
                    <a
                      href={`${BACKEND_URL}/v1/auth/github`}
                      className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium transition-all hover:border-white/20 hover:bg-white/[0.08] hover:shadow-lg"
                    >
                      <Github className="size-4" />
                      GitHub
                    </a>
                  )}
                  {providers.google && (
                    <a
                      href={`${BACKEND_URL}/v1/auth/google`}
                      className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium transition-all hover:border-white/20 hover:bg-white/[0.08] hover:shadow-lg"
                    >
                      <svg className="size-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      Google
                    </a>
                  )}
                </div>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/[0.06]" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-card/50 px-3 text-muted-foreground">
                      or continue with email
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* Email/Password form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:border-brand-cyan/50 focus:ring-2 focus:ring-brand-cyan/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:border-brand-cyan/50 focus:ring-2 focus:ring-brand-cyan/20"
                />
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg bg-red-500/10 px-3 py-2 text-center text-sm text-red-400"
                >
                  {error}
                </motion.p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-brand-cyan to-brand-cyan/80 px-4 py-3 text-sm font-bold text-black shadow-lg shadow-brand-cyan/25 transition-all hover:shadow-xl hover:shadow-brand-cyan/30 disabled:opacity-50"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-btn-shine" />
                {loading ? <Loader2 className="size-4 animate-spin" /> : "Sign In"}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link
                href="/register"
                className="font-semibold text-brand-cyan hover:underline"
              >
                Sign up free
              </Link>
            </p>
          </div>

          {/* Demo login */}
          <div className="space-y-4">
            <button
              onClick={() => {
                demoLogin();
                router.replace("/dashboard");
              }}
              className="group flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3 text-sm font-semibold text-emerald-400 transition-all hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:shadow-lg hover:shadow-emerald-400/10"
            >
              <Zap className="size-4 transition-transform group-hover:scale-110" />
              Try Demo — No Account Needed
            </button>

            <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground/60">
              <Link href="/pricing" className="hover:text-foreground hover:underline">
                Pricing
              </Link>
              <span>|</span>
              <a href="https://docs.healops.dev" target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
                Docs
              </a>
            </div>
          </div>

          {/* Mobile branding */}
          <div className="lg:hidden">
            <PoweredByGeekyAnts />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
