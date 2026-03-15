"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Loader2, Mail, ArrowLeft } from "lucide-react";
import { forgotPasswordApi } from "@/app/_libs/healops-api";
import { HealOpsLogo } from "@/app/_components/HealOpsLogo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await forgotPasswordApi(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-6"
      >
        <div className="text-center">
          <HealOpsLogo size={56} className="mx-auto shadow-lg shadow-brand-cyan/20 rounded-2xl" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Reset your password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your email and we&apos;ll send you a reset link
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-card/50 p-8 shadow-2xl shadow-black/20 backdrop-blur-xl">
          {sent ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-500/10">
                <Mail className="size-7 text-emerald-400" />
              </div>
              <h2 className="text-lg font-bold">Check your email</h2>
              <p className="text-sm text-muted-foreground">
                If an account exists for <span className="font-medium text-foreground">{email}</span>,
                we&apos;ve sent a password reset link. It expires in 1 hour.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-cyan hover:underline"
              >
                <ArrowLeft className="size-3.5" />
                Back to Login
              </Link>
            </div>
          ) : (
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

              {error && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-center text-sm text-red-400">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-cyan to-brand-cyan/80 px-4 py-3 text-sm font-bold text-black shadow-lg shadow-brand-cyan/25 transition-all hover:shadow-xl hover:shadow-brand-cyan/30 disabled:opacity-50"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : "Send Reset Link"}
              </button>

              <div className="text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="size-3.5" />
                  Back to Login
                </Link>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
