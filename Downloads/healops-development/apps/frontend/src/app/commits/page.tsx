import { Suspense } from "react";
import Page from "@/pages/CommitsPage";

export const dynamic = 'force-dynamic';

export default function RoutePage() {
  return (
    <Suspense>
      <Page />
    </Suspense>
  );
}
