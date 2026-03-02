import type { Branch } from "@/libs/mockData";
import { ExternalLink, GitPullRequest, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface PRActionBarProps {
  branch: Branch;
  isPipelineRunning: boolean;
}

const PRActionBar = ({ branch, isPipelineRunning }: PRActionBarProps) => {
  const { toast } = useToast();

  if (!branch.prUrl) return null;

  const handleAction = (action: "accept" | "decline") => {
    if (isPipelineRunning) {
      toast({
        title: "Pipeline is running",
        description: "Cannot modify PR while the pipeline is in progress. Please wait for it to complete.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: action === "accept" ? "PR Accepted & Merged" : "PR Declined",
      description: action === "accept"
        ? `Pull request for ${branch.name} has been merged.`
        : `Pull request for ${branch.name} has been declined.`,
    });
  };

  return (
    <div className="sticky bottom-0 left-0 right-0 border-t border-white/[0.06] bg-card/50 backdrop-blur-xl px-6 py-4 z-10">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-primary/15">
            <GitPullRequest size={16} className="text-brand-primary" />
          </div>
          <div>
            <p className="text-base font-bold">Pull Request</p>
            <p className="text-sm font-semibold text-muted-foreground">{branch.name}</p>
          </div>
          {branch.prStatus && (
            <span className={`text-sm px-2.5 py-1 rounded-full font-semibold border ${
              branch.prStatus === "merged"
                ? "bg-action-success/15 text-action-success border-action-success/30"
                : branch.prStatus === "declined"
                ? "bg-action-danger/15 text-action-danger border-action-danger/30"
                : "bg-action-info/15 text-action-info border-action-info/30"
            }`}>
              {branch.prStatus}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(branch.prUrl, "_blank")}
            className="gap-1.5"
          >
            <ExternalLink size={12} />
            View PR
          </Button>

          {branch.prStatus === "open" && (
            <>
              <Button
                variant="danger-soft"
                size="sm"
                onClick={() => handleAction("decline")}
                disabled={isPipelineRunning}
                className="gap-1.5"
              >
                {isPipelineRunning ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                Decline
              </Button>
              <Button
                variant="success"
                size="sm"
                onClick={() => handleAction("accept")}
                disabled={isPipelineRunning}
                className="gap-1.5"
              >
                {isPipelineRunning ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Accept & Merge
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PRActionBar;
