"use client";

import { AuthProvider } from "@/app/_libs/context/AuthContext";
import { OrgProvider } from "@/app/_libs/context/OrgContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <OrgProvider>{children}</OrgProvider>
    </AuthProvider>
  );
}
