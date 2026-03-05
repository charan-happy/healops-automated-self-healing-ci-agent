"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setAccessToken } from "@/app/_libs/healops-api";
import { HealOpsLogo } from "@/app/_components/HealOpsLogo";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const accessToken = searchParams.get("accessToken");
    const refreshToken = searchParams.get("refreshToken");

    if (accessToken && refreshToken) {
      // Store tokens
      setAccessToken(accessToken);
      localStorage.setItem("healops_refresh_token", refreshToken);

      // Extract user info from JWT payload
      try {
        const parts = accessToken.split(".");
        const payload = parts[1];
        if (payload) {
          const decoded = JSON.parse(atob(payload)) as { email?: string };
          if (decoded.email) {
            localStorage.setItem(
              "healops_user",
              JSON.stringify({
                email: decoded.email,
                firstName: "",
                lastName: "",
              }),
            );
          }
        }
      } catch {
        // Ignore JWT parse errors
      }

      router.replace("/dashboard");
    } else {
      // No tokens — redirect to login
      router.replace("/login");
    }
  }, [searchParams, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative flex size-16 items-center justify-center">
          <div className="absolute inset-0 animate-ping rounded-2xl bg-brand-cyan/20" />
          <HealOpsLogo size={56} className="relative shadow-xl shadow-brand-cyan/25 rounded-2xl" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium">Completing sign in...</p>
          <p className="mt-1 text-xs text-muted-foreground">You&apos;ll be redirected shortly</p>
        </div>
      </div>
    </div>
  );
}
