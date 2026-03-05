"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  GitBranch,
  FolderGit2,
  Cpu,
  CreditCard,
  Bell,
  Key,
} from "lucide-react";

const tabs = [
  { href: "/settings/organization" as const, label: "Organization", icon: Building2 },
  { href: "/settings/ci-providers" as const, label: "CI Providers", icon: GitBranch },
  { href: "/settings/scm-providers" as const, label: "SCM Providers", icon: FolderGit2 },
  { href: "/settings/ai-config" as const, label: "AI Config", icon: Cpu },
  { href: "/settings/billing" as const, label: "Billing", icon: CreditCard },
  { href: "/settings/notifications" as const, label: "Notifications", icon: Bell },
  { href: "/settings/api-keys" as const, label: "API Keys", icon: Key },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 md:flex-row md:p-8">
      {/* Sidebar tabs */}
      <nav className="flex shrink-0 gap-1 overflow-x-auto md:w-52 md:flex-col">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                isActive
                  ? "bg-brand-cyan/10 text-brand-cyan"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              <span className="whitespace-nowrap">{tab.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Content */}
      <div className="flex-1">{children}</div>
    </div>
  );
}
