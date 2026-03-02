'use client';

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useCallback } from "react";
import { FolderGit2, GitBranch, GitCommit, ArrowRight, Loader2, Search, ChevronDown, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import PageTransition from "../_components/PageTransition";
import { fetchRepos, fetchBranches } from "../_libs/github/github-service";
import type { Project, Branch } from "../_libs/mockData";

const ProjectsPage = () => {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [branchesMap, setBranchesMap] = useState<Record<string, Branch[]>>({});
  const [branchLoading, setBranchLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchRepos()
      .then(setProjects)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const toggleProject = useCallback(
    async (projectId: string) => {
      if (expandedId === projectId) {
        setExpandedId(null);
        return;
      }
      setExpandedId(projectId);

      if (branchesMap[projectId]) return;

      const [owner, repo] = projectId.split("--");
      if (!owner || !repo) return;

      setBranchLoading(projectId);
      try {
        const branches = await fetchBranches(owner, repo);
        setBranchesMap((prev) => ({ ...prev, [projectId]: branches }));
      } catch {
        // silently fail — branches section just stays empty
      } finally {
        setBranchLoading(null);
      }
    },
    [expandedId, branchesMap],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.toLowerCase();
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.repo.toLowerCase().includes(q),
    );
  }, [projects, search]);

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
        <p className="text-red-400">Failed to load projects: {error}</p>
      </div>
    );
  }

  return (
    <PageTransition className="max-w-4xl mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">
          <span className="text-gradient">Projects</span>
        </h1>
        <p className="text-base text-muted-foreground mt-1 font-medium">Select a project to view its branches and pipeline activity</p>
      </div>

      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search projects..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-cyan/40 focus:ring-1 focus:ring-brand-cyan/20 transition-all"
        />
      </div>

      <div className="grid gap-3">
        {filtered.map((project, i) => {
          const isExpanded = expandedId === project.id;
          const branches = branchesMap[project.id];
          const isBranchLoading = branchLoading === project.id;

          return (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <button
                onClick={() => toggleProject(project.id)}
                className="w-full text-left p-5 rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm hover:border-brand-cyan/30 hover:shadow-lg hover:shadow-brand-cyan/10 transition-all duration-300 group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-primary/15 to-brand-cyan/15 flex items-center justify-center">
                      <FolderGit2 size={20} className="text-brand-cyan" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-foreground">{project.name}</p>
                      <p className="text-sm text-muted-foreground font-medium">{project.repo}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <span className="text-sm text-muted-foreground">{project.lastActivity}</span>
                    <ChevronDown
                      size={16}
                      className={`text-muted-foreground transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </div>
                </div>
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="ml-6 mt-1 border-l-2 border-border/40 pl-4 space-y-1 py-2">
                      {isBranchLoading && (
                        <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
                          <Loader2 className="animate-spin text-brand-cyan" size={14} />
                          Loading branches...
                        </div>
                      )}

                      {!isBranchLoading && branches && branches.length === 0 && (
                        <p className="text-sm text-muted-foreground py-3">No branches found</p>
                      )}

                      {!isBranchLoading &&
                        branches?.map((branch, j) => (
                          <motion.button
                            key={branch.id}
                            onClick={() =>
                              router.push(`/commits?projectId=${project.id}&branchId=${branch.id}`)
                            }
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: j * 0.03 }}
                            className="w-full text-left px-4 py-2.5 rounded-lg border border-border/40 bg-card/60 hover:border-brand-cyan/20 hover:shadow-md hover:shadow-brand-cyan/5 transition-all duration-200 group/branch"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <GitBranch size={14} className="text-brand-cyan shrink-0" />
                                <span className="text-sm font-bold truncate">{branch.name}</span>
                              </div>
                              <ArrowRight size={14} className="text-muted-foreground group-hover/branch:text-brand-cyan transition-colors shrink-0" />
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground ml-5">
                              {branch.author && (
                                <span className="flex items-center gap-1">
                                  <User size={10} />
                                  <span className="font-medium text-foreground/70">{branch.author}</span>
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <GitCommit size={10} />
                                {branch.commitCount} commits
                              </span>
                              {branch.lastCommit && <span className="ml-auto">{branch.lastCommit}</span>}
                            </div>
                          </motion.button>
                        ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-8 text-sm">No projects matching &ldquo;{search}&rdquo;</p>
        )}
      </div>
    </PageTransition>
  );
};

export default ProjectsPage;
