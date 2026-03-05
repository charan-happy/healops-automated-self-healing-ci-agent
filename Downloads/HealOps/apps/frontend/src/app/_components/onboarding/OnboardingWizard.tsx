"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import type { OnboardingData, OnboardingStep } from "@/app/_libs/types/onboarding";
import {
  createOrganization,
  configureCiProvider,
  addScmProvider,
  selectRepositories,
  configureLlm,
  isDemoMode,
} from "@/app/_libs/healops-api";
import { useOrg } from "@/app/_libs/context/OrgContext";
import { trackEvent, POSTHOG_EVENTS } from "@/app/_libs/utils/analytics";
import { StepOrganization } from "./steps/StepOrganization";
import { StepCIProvider } from "./steps/StepCIProvider";
import { StepSCMProvider } from "./steps/StepSCMProvider";
import { StepRepositories } from "./steps/StepRepositories";
import { StepAIConfig } from "./steps/StepAIConfig";
import { StepReview } from "./steps/StepReview";

const STEPS: { key: OnboardingStep; label: string }[] = [
  { key: "create_organization", label: "Organization" },
  { key: "select_ci_provider", label: "CI Provider" },
  { key: "select_scm_provider", label: "SCM Provider" },
  { key: "select_repositories", label: "Repositories" },
  { key: "configure_ai", label: "AI Config" },
  { key: "review_activate", label: "Review" },
];

const STEP_MAP: Record<string, number> = {
  create_organization: 0,
  configure_ci_provider: 1,
  select_ci_provider: 1,
  select_scm_provider: 2,
  select_repositories: 3,
  configure_ai: 4,
  configure_llm: 4,
  review_activate: 5,
  complete: 5,
};

export default function OnboardingWizard() {
  const router = useRouter();
  const { onboardingStatus, refresh } = useOrg();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Partial<OnboardingData>>({});

  // Resume from backend state on mount
  useEffect(() => {
    if (onboardingStatus) {
      const idx = STEP_MAP[onboardingStatus.currentStep] ?? 0;
      setCurrentIndex(idx);
      if (onboardingStatus.data) {
        setData(onboardingStatus.data);
      }
    }
  }, [onboardingStatus]);

  const updateData = useCallback((patch: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...patch }));
  }, []);

  // Save current step to backend, then advance
  const next = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const step = STEPS[currentIndex];
      if (!step) return;
      const demo = isDemoMode();

      if (step.key === "create_organization" && data.organization) {
        trackEvent(POSTHOG_EVENTS.ONBOARDING_ORG_CREATED, { orgName: data.organization.name });
        if (!demo) {
          const result = await createOrganization({
            name: data.organization.name,
          });
          if (!result) throw new Error("Failed to create organization");
        }
      }

      if (step.key === "select_ci_provider") {
        const providers = data.ciProviders ?? (data.ciProvider ? [data.ciProvider] : []);
        trackEvent(POSTHOG_EVENTS.ONBOARDING_CI_PROVIDER_CONFIGURED, { providers: providers.map((p) => p.type), count: providers.length });
        if (providers.length === 0) throw new Error("Please select at least one CI provider");

        if (!demo) {
          const configIds: string[] = [];
          for (const provider of providers) {
            const result = await configureCiProvider({
              provider: provider.type,
              ...provider.config,
            });
            if (!result) throw new Error(`Failed to configure ${provider.type}`);
            const resultData = result as { providerConfigId?: string };
            if (resultData.providerConfigId) {
              configIds.push(resultData.providerConfigId);
            }
          }

          // Store provider config IDs back into data for repo selection step
          if (configIds.length > 0) {
            const updatedProviders = providers.map((p, i) => ({
              ...p,
              providerConfigId: configIds[i],
            }));
            setData((prev) => ({ ...prev, ciProviders: updatedProviders }));
          }
        }
      }

      if (step.key === "select_scm_provider") {
        const scmProviders = data.scmProviders ?? [];
        // SCM step is optional — user can skip if CI provider handles repos
        if (!demo && scmProviders.length > 0) {
          const configIds: string[] = [];
          for (const provider of scmProviders) {
            const result = await addScmProvider({
              provider: provider.type,
              ...provider.config,
            });
            if (!result) throw new Error(`Failed to configure ${provider.type} SCM`);
            if (result.providerConfigId) {
              configIds.push(result.providerConfigId);
            }
          }

          if (configIds.length > 0) {
            const updatedProviders = scmProviders.map((p, i) => ({
              ...p,
              providerConfigId: configIds[i],
            }));
            setData((prev) => ({ ...prev, scmProviders: updatedProviders }));
          }
        }
      }

      if (step.key === "select_repositories" && data.repositories) {
        if (!demo) {
          const result = await selectRepositories({
            repositories: data.repositories,
          });
          if (!result) throw new Error("Failed to save repositories");
        }
      }

      if (step.key === "configure_ai" && data.aiConfig) {
        if (!demo) {
          const result = await configureLlm({
            provider: data.aiConfig.provider,
            ...data.aiConfig.config,
          });
          if (!result) throw new Error("Failed to configure AI provider");
        }
      }

      setCurrentIndex((i) => Math.min(i + 1, STEPS.length - 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }, [currentIndex, data]);

  const back = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
    setError(null);
  }, []);

  // Final activation — configure LLM (if not already done) and complete
  const handleActivate = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const demo = isDemoMode();
      if (data.aiConfig && !demo) {
        const result = await configureLlm({
          provider: data.aiConfig.provider,
          ...data.aiConfig.config,
        });
        if (!result) throw new Error("Failed to configure AI");
      }
      trackEvent(POSTHOG_EVENTS.ONBOARDING_COMPLETED);
      if (!demo) {
        await refresh();
      }
      router.push("/dashboard" as const);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation failed");
    } finally {
      setSubmitting(false);
    }
  }, [data, refresh, router]);

  const step = STEPS[currentIndex];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          Set up <span className="text-brand-cyan">HealOps</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect your CI pipeline and let HealOps auto-fix failures
        </p>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex flex-1 items-center gap-2">
            <div
              className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-all ${
                i < currentIndex
                  ? "bg-brand-cyan text-black"
                  : i === currentIndex
                    ? "border-2 border-brand-cyan text-brand-cyan"
                    : "border border-white/20 text-muted-foreground"
              }`}
            >
              {i < currentIndex ? <Check className="size-4" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-px flex-1 transition-all ${
                  i < currentIndex ? "bg-brand-cyan" : "bg-white/10"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={step?.key}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {currentIndex === 0 && (
              <StepOrganization data={data} onUpdate={updateData} />
            )}
            {currentIndex === 1 && (
              <StepCIProvider data={data} onUpdate={updateData} />
            )}
            {currentIndex === 2 && (
              <StepSCMProvider data={data} onUpdate={updateData} />
            )}
            {currentIndex === 3 && (
              <StepRepositories data={data} onUpdate={updateData} />
            )}
            {currentIndex === 4 && (
              <StepAIConfig data={data} onUpdate={updateData} />
            )}
            {currentIndex === 5 && <StepReview data={data} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Error message */}
      {error && (
        <p className="text-center text-sm text-red-400">{error}</p>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={back}
          disabled={currentIndex === 0 || submitting}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-all hover:text-foreground disabled:invisible"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>

        {currentIndex < STEPS.length - 1 ? (
          <button
            onClick={next}
            disabled={submitting}
            className="flex items-center gap-2 rounded-lg bg-brand-cyan px-6 py-2 text-sm font-semibold text-black transition-all hover:bg-brand-cyan/90 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                Continue
                <ArrowRight className="size-4" />
              </>
            )}
          </button>
        ) : (
          <button
            onClick={handleActivate}
            disabled={submitting}
            className="flex items-center gap-2 rounded-lg bg-brand-cyan px-6 py-2 text-sm font-semibold text-black transition-all hover:bg-brand-cyan/90 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Activate HealOps
          </button>
        )}
      </div>
    </div>
  );
}
