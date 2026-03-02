"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderGit2,
  Wrench,
  Settings,
  BookOpen,
  ChevronsUpDown,
  Building2,
  CreditCard,
  Bell,
  Key,
  Cpu,
  GitBranch,
  Zap,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useOrg } from "@/app/_libs/context/OrgContext";
import { useAuth } from "@/app/_libs/context/AuthContext";

const settingsSubItems = [
  { title: "Organization", href: "/settings/organization" as const, icon: Building2 },
  { title: "CI Providers", href: "/settings/ci-providers" as const, icon: GitBranch },
  { title: "AI Config", href: "/settings/ai-config" as const, icon: Cpu },
  { title: "Billing", href: "/settings/billing" as const, icon: CreditCard },
  { title: "Notifications", href: "/settings/notifications" as const, icon: Bell },
  { title: "API Keys", href: "/settings/api-keys" as const, icon: Key },
];

function isNavActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/projects") {
    return (
      pathname === "/projects" ||
      pathname.startsWith("/branches") ||
      pathname.startsWith("/commits") ||
      pathname.startsWith("/fix-details")
    );
  }
  return pathname === href;
}

export function AppSidebar() {
  const pathname = usePathname();
  const { onboardingStatus, subscription } = useOrg();
  const { user, logout } = useAuth();

  const orgName =
    (onboardingStatus?.data?.organization as { name?: string } | undefined)
      ?.name ?? "My Org";
  const planName = subscription?.plan?.name ?? "Free Plan";
  const initials = orgName.slice(0, 2).toUpperCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard" className="!h-auto !py-3">
                <div className="flex aspect-square size-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-cyan to-brand-primary shadow-lg shadow-brand-cyan/20">
                  <Zap className="size-5 text-white" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-lg font-black tracking-tight text-gradient">
                    HealOps
                  </span>
                  <span className="truncate text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    Autonomous CI/CD
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <Separator className="bg-white/[0.06]" />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isNavActive(pathname, "/dashboard")}>
                  <Link href="/dashboard">
                    <LayoutDashboard />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isNavActive(pathname, "/projects")}>
                  <Link href="/projects">
                    <FolderGit2 />
                    <span>Projects</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname.startsWith("/repair-jobs")}>
                  <Link href="/dashboard">
                    <Wrench />
                    <span>Repair Jobs</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <Collapsible defaultOpen={pathname.startsWith("/settings")}>
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton>
                      <Settings />
                      <span>Settings</span>
                      <ChevronsUpDown className="ml-auto size-4" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {settingsSubItems.map((item) => (
                        <SidebarMenuSubItem key={item.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname === item.href}
                          >
                            <Link href={item.href}>
                              <item.icon className="size-3.5" />
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a
                    href="https://docs.healops.dev"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <BookOpen />
                    <span>Docs</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <Separator className="bg-white/[0.06]" />
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
              <Avatar className="size-8">
                <AvatarFallback className="bg-brand-cyan/20 text-brand-cyan text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{orgName}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {user?.email ?? planName}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={logout}
              className="text-muted-foreground hover:text-red-400"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Log out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
