import { Suspense } from "react";
import Page from "@/pages/BranchesPage";

export const dynamic = 'force-dynamic';

export default function RoutePage() {
  return (
    <Suspense>
      <Page />
    </Suspense>
  );
}
