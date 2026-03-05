// Re-export real WebSocket hook — replaces the previous setTimeout simulation.
// Components that imported usePipelineWebSocket can keep their import path.

import { useRepairEvents, type RepairEvent } from "./useRepairEvents";

export type { RepairEvent as PipelineEvent };

export const usePipelineWebSocket = (
  commitId: string | null,
  _isRunning: boolean,
) => {
  const { events, currentStage, progress, connected } = useRepairEvents(
    commitId,
  );
  return { events, currentStage, progress, connected };
};
