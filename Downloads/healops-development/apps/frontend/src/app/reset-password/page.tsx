"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Loader2, CheckCircle2, XCircle, ArrowLeft } from "lucide-react";
import { resetPasswordApi } from "@/app/_libs/healops-api";
import { HealOpsLogo } from "@/app/_components/HealOpsLogo";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (!token) {
      setError("No reset token provided");
      return;
    }

    setLoading(true);
    try {
      await resetPasswordApi(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password reset failed");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="space-y-4 text-center">
          <XCircle className="mx-auto size-12 text-red-400" />
          <h1 className="text-2xl font-bold">Invalid Reset Link</h1>
          <p className="text-sm text-muted-foreground">No reset token was found in the URL.</p>
          <Link href="/forgot-password" className="text-sm font-semibold text-brand-cyan hover:underline">
            Request a new reset link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-6"
      >
        <div className="text-center">
          <HealOpsLogo size={56} className="mx-auto shadow-lg shadow-brand-cyan/20 rounded-2xl" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Set new password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a strong password for your account
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-card/50 p-8 shadow-2xl shadow-black/20 backdrop-blur-xl">
          {success ? (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto size-12 text-emerald-400" />
              <h2 className="text-lg font-bold">Password Reset</h2>
              <p className="text-sm text-muted-foreground">
                Your password has been reset successfully. You can now log in with your new password.
              </p>
              <Link
                href="/login"
                className="inline-block rounded-xl bg-gradient-to-r from-brand-cyan to-brand-cyan/80 px-6 py-2.5 text-sm font-bold text-black shadow-lg shadow-brand-cyan/25 transition-all hover:shadow-xl"
              >
                Go to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  New Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  required
                  minLength={8}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:border-brand-cyan/50 focus:ring-2 focus:ring-brand-cyan/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
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
                {loading ? <Loader2 className="size-4 animate-spin" /> : "Reset Password"}
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
