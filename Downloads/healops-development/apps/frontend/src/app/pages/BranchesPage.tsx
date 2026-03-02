'use client';

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import BranchList from "../_components/BranchList";
import PageTransition from "../_components/PageTransition";
import { GitBranch, Loader2, Search } from "lucide-react";
import { fetchBranches } from "../_libs/github/github-service";
import type { Branch } from "../_libs/mockData";

const BranchesPage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams?.get("projectId");

  const [owner, repo] = projectId ? projectId.split("--") : [null, null];

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!owner || !repo) {
      setLoading(false);
      return;
    }
    fetchBranches(owner, repo)
      .then(setBranches)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [owner, repo]);

  const filtered = useMemo(() => {
    if (!search.trim()) return branches;
    const q = search.toLowerCase();
    return branches.filter((b) => b.name.toLowerCase().includes(q));
  }, [branches, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-brand-cyan" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <p className="text-red-400">Failed to load branches: {error}</p>
      </div>
    );
  }

  return (
    <PageTransition className="max-w-4xl mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-primary/15 to-brand-cyan/15">
            <GitBranch size={20} className="text-brand-cyan" />
          </div>
          <span className="text-gradient">Branches</span>
        </h1>
        <p className="text-base text-muted-foreground mt-1 font-medium">User-created branches only</p>
      </div>

      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search branches..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-cyan/40 focus:ring-1 focus:ring-brand-cyan/20 transition-all"
        />
      </div>

      <BranchList
        branches={filtered}
        selectedBranchId={null}
        onSelectBranch={(id) =>
          projectId
            ? router.push(`/commits?projectId=${projectId}&branchId=${id}`)
            : undefined
        }
      />
    </PageTransition>
  );
};

export default BranchesPage;
