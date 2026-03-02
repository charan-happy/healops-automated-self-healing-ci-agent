import { Suspense } from "react";
import OnboardingWizard from "@/app/_components/onboarding/OnboardingWizard";

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingWizard />
    </Suspense>
  );
}
