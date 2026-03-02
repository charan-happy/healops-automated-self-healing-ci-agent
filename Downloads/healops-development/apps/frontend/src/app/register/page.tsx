"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Zap, Loader2, Check } from "lucide-react";
import { useAuth } from "@/app/_libs/context/AuthContext";
import { PoweredByGeekyAnts } from "@/app/_components/PoweredByGeekyAnts";

const PERKS = [
  "50 free autonomous repairs/month",
  "GitHub, GitLab, Bitbucket support",
  "Multi-language error detection",
  "Real-time repair dashboard",
];

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(email, password, firstName, lastName);
      router.replace("/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full overflow-hidden">
      {/* Animated background orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 size-[500px] animate-pulse rounded-full bg-brand-primary/[0.07] blur-[120px]" />
        <div className="absolute -bottom-32 -right-32 size-[400px] animate-pulse rounded-full bg-emerald-500/[0.07] blur-[120px] [animation-delay:1s]" />
      </div>

      {/* Left panel — branding */}
      <div className="hidden flex-1 flex-col justify-between p-12 lg:flex">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-cyan to-brand-primary shadow-xl shadow-brand-cyan/25">
              <Zap className="size-6 text-white" />
            </div>
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
              Get started{" "}
              <span className="bg-gradient-to-r from-emerald-400 to-brand-cyan bg-clip-text text-transparent">
                for free.
              </span>
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              No credit card required. Start healing your pipelines in under 5 minutes.
            </p>
          </div>

          <div className="space-y-3">
            {PERKS.map((perk, i) => (
              <motion.div
                key={perk}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.12 }}
                className="flex items-center gap-3"
              >
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/15">
                  <Check className="size-3.5 text-emerald-400" />
                </div>
                <span className="text-sm text-muted-foreground">{perk}</span>
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

      {/* Right panel — register form */}
      <div className="flex flex-1 items-center justify-center p-6 lg:p-12">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-[420px] space-y-7"
        >
          {/* Mobile logo */}
          <div className="text-center lg:hidden">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-cyan to-brand-primary shadow-lg shadow-brand-cyan/20">
              <Zap className="size-7 text-white" />
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight">HealOps</h1>
          </div>

          {/* Card */}
          <div className="rounded-2xl border border-white/[0.08] bg-card/50 p-8 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <div className="mb-6">
              <h2 className="text-xl font-bold tracking-tight">Create your account</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Start fixing CI/CD failures in minutes
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    First name
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Jane"
                    required
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:border-brand-cyan/50 focus:ring-2 focus:ring-brand-cyan/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Last name
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                    required
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:border-brand-cyan/50 focus:ring-2 focus:ring-brand-cyan/20"
                  />
                </div>
              </div>

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
                  placeholder="Min 8 chars, uppercase, lowercase, digit, special"
                  required
                  minLength={8}
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
                {loading ? <Loader2 className="size-4 animate-spin" /> : "Create Account"}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-semibold text-brand-cyan hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>

          <div className="lg:hidden">
            <PoweredByGeekyAnts />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
