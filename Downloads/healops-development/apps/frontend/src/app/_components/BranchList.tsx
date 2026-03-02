import type { Branch } from "@/libs/mockData";
import StatusBadge from "./StatusBadge";
import { GitBranch, User, GitCommit } from "lucide-react";
import { motion } from "framer-motion";

interface BranchListProps {
  branches: Branch[];
  selectedBranchId: string | null;
  onSelectBranch: (id: string) => void;
}

const BranchList = ({ branches, selectedBranchId, onSelectBranch }: BranchListProps) => {
  if (branches.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-primary/15 to-brand-cyan/15 flex items-center justify-center mb-4">
          <GitBranch size={28} className="text-brand-cyan animate-pulse" />
        </div>
        <p className="text-base font-semibold text-foreground">No branches found</p>
        <p className="text-sm text-muted-foreground mt-1">Branches will appear here once they are created</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {branches.map((branch, i) => {
        const isSelected = branch.id === selectedBranchId;
        return (
          <motion.button
            key={branch.id}
            onClick={() => onSelectBranch(branch.id)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`w-full text-left px-4 py-3 rounded-xl border transition-all duration-300 ${
              isSelected
                ? "bg-brand-cyan/10 border-transparent animated-border glow-primary"
                : "bg-card/80 backdrop-blur-sm border-border/50 hover:border-brand-cyan/20 hover:shadow-lg hover:shadow-brand-cyan/10 hover:-translate-y-0.5"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <GitBranch size={16} className="text-brand-cyan shrink-0" />
                <span className="text-base font-bold truncate">{branch.name}</span>
              </div>
              <StatusBadge status={branch.pipelineStatus} />
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground ml-6">
              <span className="flex items-center gap-1">
                <User size={12} />
                <span className="font-medium text-foreground/70">{branch.author}</span>
              </span>
              <span className="flex items-center gap-1">
                <GitCommit size={12} />
                {branch.commitCount} commits
              </span>
              <span className="ml-auto">{branch.lastCommit}</span>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
};

export default BranchList;
