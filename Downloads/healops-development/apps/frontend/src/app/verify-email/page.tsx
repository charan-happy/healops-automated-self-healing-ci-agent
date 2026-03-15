"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { verifyEmailApi } from "@/app/_libs/healops-api";
import { HealOpsLogo } from "@/app/_components/HealOpsLogo";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("No verification token provided.");
      return;
    }

    verifyEmailApi(token)
      .then(() => {
        setStatus("success");
        // Update localStorage so the dashboard banner disappears
        try {
          const savedUser = localStorage.getItem("healops_user");
          if (savedUser) {
            const parsed = JSON.parse(savedUser);
            parsed.isEmailVerified = true;
            localStorage.setItem("healops_user", JSON.stringify(parsed));
          }
        } catch {
          // ignore parse errors
        }
      })
      .catch((err) => {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "Verification failed");
      });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-6 text-center"
      >
        <HealOpsLogo size={56} className="mx-auto shadow-lg shadow-brand-cyan/20 rounded-2xl" />

        {status === "loading" && (
          <div className="space-y-3">
            <Loader2 className="mx-auto size-10 animate-spin text-brand-cyan" />
            <p className="text-muted-foreground">Verifying your email...</p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-8">
            <CheckCircle2 className="mx-auto size-12 text-emerald-400" />
            <h1 className="text-2xl font-bold">Email Verified</h1>
            <p className="text-sm text-muted-foreground">
              Your email has been verified successfully. You can now access all features.
            </p>
            <Link
              href="/dashboard"
              className="inline-block rounded-xl bg-gradient-to-r from-brand-cyan to-brand-cyan/80 px-6 py-2.5 text-sm font-bold text-black shadow-lg shadow-brand-cyan/25 transition-all hover:shadow-xl"
            >
              Go to Dashboard
            </Link>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4 rounded-2xl border border-red-500/20 bg-red-500/5 p-8">
            <XCircle className="mx-auto size-12 text-red-400" />
            <h1 className="text-2xl font-bold">Verification Failed</h1>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <div className="flex flex-col items-center gap-2">
              <Link
                href="/login"
                className="text-sm font-semibold text-brand-cyan hover:underline"
              >
                Back to Login
              </Link>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
