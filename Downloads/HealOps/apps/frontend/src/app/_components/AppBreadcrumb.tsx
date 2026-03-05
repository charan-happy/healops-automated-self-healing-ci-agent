'use client';

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const pageNames: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/projects": "Projects",
  "/branches": "Branches",
  "/commits": "Commits",
  "/fix-details": "Fix Details",
  "/settings": "Settings",
  "/settings/organization": "Organization",
  "/settings/ci-providers": "CI Providers",
  "/settings/ai-config": "AI Config",
  "/settings/billing": "Billing",
  "/settings/notifications": "Notifications",
  "/settings/api-keys": "API Keys",
  "/repair-jobs": "Repair Jobs",
};

const AppBreadcrumb = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");
  const branchId = searchParams.get("branchId");
  const commitId = searchParams.get("commitId");

  const repoName = projectId ? projectId.split("--")[1] ?? projectId : null;
  const currentPage = pageNames[pathname] ?? pathname.split("/").pop() ?? "";

  return (
    <Breadcrumb>
      <BreadcrumbList>
          <BreadcrumbItem>
            {projectId ? (
              <BreadcrumbLink asChild>
                <Link href={(pathname.split("?")[0] ?? pathname) as "/dashboard"}>{currentPage}</Link>
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage className="text-sm font-medium">
                {currentPage}
              </BreadcrumbPage>
            )}
          </BreadcrumbItem>

          {projectId && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {!branchId ? (
                  <BreadcrumbPage className="text-sm font-medium">{repoName}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={`/branches?projectId=${projectId}`}>{repoName}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </>
          )}

          {branchId && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {!commitId ? (
                  <BreadcrumbPage className="text-sm font-medium">{branchId}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link
                      href={`/commits?projectId=${projectId}&branchId=${branchId}`}
                      className="text-sm font-medium"
                    >
                      {branchId}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </>
          )}

          {commitId && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-sm font-bold text-brand-cyan bg-brand-cyan/10 px-1.5 py-0.5 rounded">
                  {commitId.slice(0, 7)}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>
  );
};

export default AppBreadcrumb;
