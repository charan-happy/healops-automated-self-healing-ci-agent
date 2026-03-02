import { Suspense } from "react";
import DashboardPage from "@/pages/DashboardPage";

export default function RoutePage() {
  return (
    <Suspense>
      <DashboardPage />
    </Suspense>
  );
}
