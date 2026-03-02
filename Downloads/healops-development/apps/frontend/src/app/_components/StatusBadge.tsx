import type { PipelineStatus } from "@/libs/mockData";
import { CheckCircle2, XCircle, Loader2, Clock, Wrench, AlertTriangle } from "lucide-react";

interface StatusBadgeProps {
  status: PipelineStatus;
  size?: "sm" | "md";
}

const statusConfig: Record<PipelineStatus, { label: string; className: string; Icon: React.ElementType }> = {
  success: { label: "Passed", className: "bg-action-success/15 text-action-success border-action-success/25", Icon: CheckCircle2 },
  failed: { label: "Failed", className: "bg-action-danger/15 text-action-danger border-action-danger/25", Icon: XCircle },
  running: { label: "Running", className: "bg-action-info/15 text-action-info border-action-info/25", Icon: Loader2 },
  pending: { label: "Pending", className: "bg-action-neutral/15 text-action-neutral border-action-neutral/25", Icon: Clock },
  fixed: { label: "Fixed", className: "bg-action-success/15 text-action-success border-action-success/25", Icon: Wrench },
  escalated: { label: "Escalated", className: "bg-action-warning/15 text-action-warning border-action-warning/25", Icon: AlertTriangle },
};

const StatusBadge = ({ status, size = "sm" }: StatusBadgeProps) => {
  const { label, className, Icon } = statusConfig[status];
  const sizeClasses = size === "sm" ? "text-sm px-2.5 py-0.5 gap-1" : "text-base px-3 py-1 gap-1.5";
  const iconSize = size === "sm" ? 13 : 16;

  return (
    <span className={`inline-flex items-center rounded-full border font-bold ${className} ${sizeClasses}`}>
      <Icon size={iconSize} className={status === "running" ? "animate-spin-slow" : ""} />
      {label}
    </span>
  );
};

export default StatusBadge;
