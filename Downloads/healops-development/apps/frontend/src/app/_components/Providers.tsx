"use client";

import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/app/_libs/context/AuthContext";
import { OrgProvider } from "@/app/_libs/context/OrgContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <OrgProvider>{children}</OrgProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
