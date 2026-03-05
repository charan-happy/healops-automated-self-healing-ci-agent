"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { fetchOnboardingStatus, fetchSubscription } from "@/app/_libs/healops-api";
import type { OnboardingStatus } from "@/app/_libs/types/onboarding";
import type { Subscription } from "@/app/_libs/types/settings";

interface OrgContextValue {
  onboardingStatus: OnboardingStatus | null;
  subscription: Subscription | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const OrgContext = createContext<OrgContextValue>({
  onboardingStatus: null,
  subscription: null,
  loading: true,
  refresh: async () => {},
});

export function useOrg() {
  return useContext(OrgContext);
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const [onboardingStatus, setOnboardingStatus] =
    useState<OnboardingStatus | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [status, sub] = await Promise.all([
        fetchOnboardingStatus(),
        fetchSubscription(),
      ]);
      setOnboardingStatus(status);
      setSubscription(sub);
    } catch {
      // Fail silently — context consumers handle null values
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <OrgContext.Provider
      value={{ onboardingStatus, subscription, loading, refresh: load }}
    >
      {children}
    </OrgContext.Provider>
  );
}
