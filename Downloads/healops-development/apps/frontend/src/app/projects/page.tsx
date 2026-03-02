import { Suspense } from "react";
import Page from "@/pages/ProjectsPage";

export default function RoutePage() {
  return (
    <Suspense>
      <Page />
    </Suspense>
  );
}
