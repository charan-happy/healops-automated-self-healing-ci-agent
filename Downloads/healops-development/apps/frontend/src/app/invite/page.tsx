"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { acceptInvitation } from "@/app/_libs/healops-api";
import { useAuth } from "@/app/_libs/context/AuthContext";
import { HealOpsLogo } from "@/app/_components/HealOpsLogo";

type Status = "loading" | "needsLogin" | "accepting" | "success" | "error";

export default function InvitePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [orgName, setOrgName] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Invalid invitation link — no token provided.");
      return;
    }

    if (authLoading) return;

    if (!user) {
      setStatus("needsLogin");
      return;
    }

    // User is logged in — accept the invitation
    setStatus("accepting");
    acceptInvitation(token)
      .then((result) => {
        if (result?.accepted) {
          setOrgName(result.organizationName);
          setStatus("success");
        } else {
          setStatus("error");
          setMessage("Failed to accept invitation. Please try again.");
        }
      })
      .catch((err) => {
        setStatus("error");
        setMessage(
          err instanceof Error ? err.message : "Failed to accept invitation.",
        );
      });
  }, [token, user, authLoading]);

  const handleLoginRedirect = () => {
    // After login, user should click the invite link from email again
    router.push("/login");
  };

  const handleRegisterRedirect = () => {
    router.push("/register");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border/50 bg-card p-8 shadow-lg">
        <div className="mb-6 flex justify-center">
          <HealOpsLogo size="md" />
        </div>

        {(status === "loading" || status === "accepting") && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-brand-cyan" />
            <p className="text-muted-foreground">
              {status === "loading" ? "Checking invitation..." : "Accepting invitation..."}
            </p>
          </div>
        )}

        {status === "needsLogin" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <h2 className="text-xl font-semibold text-foreground">
              You&apos;ve been invited!
            </h2>
            <p className="text-center text-muted-foreground">
              Please log in or create an account to accept this invitation.
            </p>
            <div className="mt-4 flex w-full flex-col gap-3">
              <button
                onClick={handleLoginRedirect}
                className="w-full rounded-lg bg-brand-cyan px-4 py-2.5 font-medium text-white transition-colors hover:bg-brand-cyan/90"
              >
                Log in
              </button>
              <button
                onClick={handleRegisterRedirect}
                className="w-full rounded-lg border border-border px-4 py-2.5 font-medium text-foreground transition-colors hover:bg-muted"
              >
                Create account
              </button>
            </div>
          </div>
        )}

        {status === "success" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <CheckCircle className="h-12 w-12 text-green-500" />
            <h2 className="text-xl font-semibold text-foreground">
              Welcome to {orgName}!
            </h2>
            <p className="text-center text-muted-foreground">
              You&apos;ve successfully joined the organization.
            </p>
            <button
              onClick={() => router.push("/")}
              className="mt-4 w-full rounded-lg bg-brand-cyan px-4 py-2.5 font-medium text-white transition-colors hover:bg-brand-cyan/90"
            >
              Go to Dashboard
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <XCircle className="h-12 w-12 text-red-500" />
            <h2 className="text-xl font-semibold text-foreground">
              Invitation Error
            </h2>
            <p className="text-center text-muted-foreground">{message}</p>
            <button
              onClick={() => router.push("/login")}
              className="mt-4 w-full rounded-lg bg-brand-cyan px-4 py-2.5 font-medium text-white transition-colors hover:bg-brand-cyan/90"
            >
              Go to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
