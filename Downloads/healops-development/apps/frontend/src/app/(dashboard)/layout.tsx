"use client";

import { Suspense } from "react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/app/_components/AppSidebar";
import AppBreadcrumb from "@/app/_components/AppBreadcrumb";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-card/80 backdrop-blur-xl px-6">
          <SidebarTrigger className="-ml-1 size-7 text-muted-foreground hover:text-foreground" />
          <Separator orientation="vertical" className="mr-2 h-4 bg-white/10" />
          <Suspense fallback={null}>
            <AppBreadcrumb />
          </Suspense>
        </header>
        <div className="flex-1 overflow-auto">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
