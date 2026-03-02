'use client';

import { useState } from "react";
import ProjectSidebar from "../_components/ProjectSidebar";
import BranchList from "../_components/BranchList";
import CommitTimeline from "../_components/CommitTimeline";
import FixDetailPanel from "../_components/FixDetailPanel";
import { mockProjects, mockBranches, mockCommits, mockAgentFixes } from "../_libs/mockData";
import { GitBranch, GitCommit, Bot, FolderGit2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const Index = () => {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);

  const branches = selectedProjectId ? mockBranches[selectedProjectId] ?? [] : [];
  const commits = selectedBranchId ? mockCommits[selectedBranchId] ?? [] : [];
  const fixes = selectedCommitId ? mockAgentFixes[selectedCommitId] ?? [] : [];
  const selectedCommit = commits.find((c) => c.id === selectedCommitId);

  const handleSelectProject = (id: string) => {
    setSelectedProjectId(id);
    setSelectedBranchId(null);
    setSelectedCommitId(null);
  };

  const handleSelectBranch = (id: string) => {
    setSelectedBranchId(id);
    setSelectedCommitId(null);
  };

  const EmptyState = ({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) => (
    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
      <Icon size={32} className="mb-3 opacity-30" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs mt-1 text-center max-w-48">{subtitle}</p>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <ProjectSidebar
        projects={mockProjects}
        selectedProjectId={selectedProjectId}
        onSelectProject={handleSelectProject}
      />

      {/* Branch panel */}
      <div className="w-72 min-w-[288px] border-r border-border flex flex-col bg-surface-1">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <GitBranch size={14} className="text-primary" />
            Branches
          </h2>
          {selectedProjectId && (
            <p className="text-xs text-muted-foreground mt-0.5">
              User-created branches only
            </p>
          )}
        </div>
        <ScrollArea className="flex-1 p-3">
          {selectedProjectId ? (
            <BranchList
              branches={branches}
              selectedBranchId={selectedBranchId}
              onSelectBranch={handleSelectBranch}
            />
          ) : (
            <EmptyState icon={FolderGit2} title="Select a project" subtitle="Choose a project from the sidebar to see its branches" />
          )}
        </ScrollArea>
      </div>

      {/* Commit panel */}
      <div className="w-80 min-w-[320px] border-r border-border flex flex-col bg-surface-1">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <GitCommit size={14} className="text-primary" />
            Commits
          </h2>
          {selectedBranchId && (
            <p className="text-xs text-muted-foreground mt-0.5">
              User commits with pipeline status
            </p>
          )}
        </div>
        <ScrollArea className="flex-1 p-3">
          {selectedBranchId ? (
            <CommitTimeline
              commits={commits}
              selectedCommitId={selectedCommitId}
              onSelectCommit={setSelectedCommitId}
            />
          ) : (
            <EmptyState icon={GitBranch} title="Select a branch" subtitle="Choose a branch to view its commit history" />
          )}
        </ScrollArea>
      </div>

      {/* Fix detail panel */}
      <div className="flex-1 flex flex-col bg-surface-1 min-w-0">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Bot size={14} className="text-primary" />
            Agent Fixes
          </h2>
          {selectedCommitId && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Automated fixes and retry history
            </p>
          )}
        </div>
        <ScrollArea className="flex-1">
          {selectedCommitId && selectedCommit ? (
            <FixDetailPanel fixes={fixes} commitSha={selectedCommit.sha} />
          ) : (
            <EmptyState icon={Bot} title="Select a commit" subtitle="Choose a commit to see agent fix details and diff comparisons" />
          )}
        </ScrollArea>
      </div>
    </div>
  );
};

export default Index;
