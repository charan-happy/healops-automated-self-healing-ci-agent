'use client';

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Wrench } from "lucide-react";

const AppBreadcrumb = () => {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");
  const branchId = searchParams.get("branchId");
  const commitId = searchParams.get("commitId");

  // Derive display names from query params
  const repoName = projectId ? projectId.split("--")[1] ?? projectId : null;

  return (
    <div className="relative z-20 border-b border-white/[0.06] bg-card/60 backdrop-blur-xl px-6 py-3">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/" className="flex items-center gap-1.5">
                <Wrench size={14} className="text-brand-cyan" />
                <span className="font-bold">Healops</span>
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>

          {projectId && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {!branchId ? (
                  <BreadcrumbPage>{repoName}</BreadcrumbPage>
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
                <BreadcrumbPage className="text-sm font-bold text-brand-cyan bg-brand-cyan/10 px-1.5 py-0.5 rounded">{commitId.slice(0, 7)}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
};

export default AppBreadcrumb;
