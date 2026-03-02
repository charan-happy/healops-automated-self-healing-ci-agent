import { usePipelineWebSocket } from "../hooks/usePipelineWebSocket";
import { Loader2, Radio, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Progress } from "@/components/ui/progress";

interface PipelineLiveStatusProps {
  commitId: string;
}

const PipelineLiveStatus = ({ commitId }: PipelineLiveStatusProps) => {
  const { events, currentStage, progress, connected } = usePipelineWebSocket(commitId, true);

  if (!connected) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-status-running/30 bg-status-running/5 p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <Radio size={16} className="text-status-running animate-pulse" />
        <span className="text-base font-bold text-status-running">Pipeline Running — Live</span>
        <span className="text-sm text-foreground/60 ml-auto font-bold uppercase tracking-wider">WebSocket</span>
      </div>

      <Progress value={progress} className="h-1.5" />

      <AnimatePresence mode="wait">
        {currentStage && (
          <motion.div
            key={currentStage}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            className="flex items-center gap-2 text-sm"
          >
            <Loader2 size={14} className="animate-spin-slow text-status-running" />
            <span className="text-base font-semibold text-foreground/80">{currentStage}</span>
            <span className="text-sm font-bold text-foreground/60 ml-auto">{progress}%</span>
          </motion.div>
        )}
      </AnimatePresence>

      {events.length > 0 && (
        <div className="space-y-1 max-h-32 overflow-auto">
          {events.map((event, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 size={12} className="text-status-success shrink-0" />
              <span className="tabular-nums">{event.timestamp}</span>
              <span>{event.stage}</span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default PipelineLiveStatus;
