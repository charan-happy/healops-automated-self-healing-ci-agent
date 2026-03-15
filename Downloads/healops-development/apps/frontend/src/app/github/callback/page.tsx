"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { addCiProvider } from "@/app/_libs/healops-api";

/**
 * GitHub App installation callback handler.
 *
 * After a user installs the HealOps GitHub App, GitHub redirects here with:
 *   ?installation_id=123456&setup_action=install
 *
 * This page auto-saves the installation as a CI provider and redirects
 * to the CI providers settings page.
 */
export default function GitHubCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"saving" | "success" | "error">("saving");
  const [error, setError] = useState("");

  const installationId = searchParams.get("installation_id");
  const setupAction = searchParams.get("setup_action");

  useEffect(() => {
    if (!installationId) {
      setStatus("error");
      setError("No installation_id received from GitHub.");
      return;
    }

    async function saveInstallation() {
      const result = await addCiProvider({
        provider: "github",
        githubInstallationId: installationId!,
        displayName: "GitHub",
      });

      if (result) {
        setStatus("success");
        setTimeout(() => {
          router.replace("/settings/ci-providers");
        }, 1500);
      } else {
        setStatus("error");
        setError("Failed to save GitHub App installation. You can add it manually in Settings.");
      }
    }

    saveInstallation();
  }, [installationId, setupAction, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border/50 bg-card p-8 text-center">
        {status === "saving" && (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="size-8 animate-spin text-brand-cyan" />
            <p className="text-sm text-muted-foreground">
              Saving GitHub App installation...
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="flex flex-col items-center gap-4">
            <CheckCircle className="size-10 text-emerald-400" />
            <h2 className="text-lg font-semibold">GitHub App Connected!</h2>
            <p className="text-sm text-muted-foreground">
              Redirecting to settings...
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-4">
            <XCircle className="size-10 text-red-400" />
            <h2 className="text-lg font-semibold">Setup Issue</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => router.push("/settings/ci-providers")}
                className="rounded-lg bg-brand-cyan px-4 py-2 text-sm font-medium text-black hover:bg-brand-cyan/90"
              >
                Go to Settings
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
