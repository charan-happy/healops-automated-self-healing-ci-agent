import type { Project } from "@/libs/mockData";
import { GitBranch, FolderGit2, Wrench } from "lucide-react";
import { motion } from "framer-motion";

interface ProjectSidebarProps {
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (id: string) => void;
}

const ProjectSidebar = ({ projects, selectedProjectId, onSelectProject }: ProjectSidebarProps) => {
  return (
    <aside className="w-64 min-w-[256px] bg-sidebar border-r border-sidebar-border flex flex-col h-full">
      <div className="p-4 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-primary/25 to-brand-cyan/25 flex items-center justify-center">
            <Wrench className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">Healops</h1>
            <p className="text-sm text-muted-foreground font-medium tracking-wide">autonomous CI/CD</p>
          </div>
        </div>
      </div>

      <div className="p-3">
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider px-2 mb-2">Projects</p>
        <nav className="space-y-1">
          {projects.map((project) => {
            const isSelected = project.id === selectedProjectId;
            return (
              <motion.button
                key={project.id}
                onClick={() => onSelectProject(project.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors group relative ${
                  isSelected
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                }`}
                whileTap={{ scale: 0.98 }}
              >
                {isSelected && (
                  <motion.div
                    layoutId="sidebar-indicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r"
                  />
                )}
                <div className="flex items-center gap-2.5">
                  <FolderGit2 size={16} className={isSelected ? "text-primary" : "text-muted-foreground"} />
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold truncate">{project.name}</p>
                    <p className="text-sm text-muted-foreground truncate">{project.repo}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-1 ml-7">
                  <GitBranch size={12} className="text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{project.branchCount} branches</span>
                  <span className="text-sm text-muted-foreground ml-auto">{project.lastActivity}</span>
                </div>
              </motion.button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
};

export default ProjectSidebar;
