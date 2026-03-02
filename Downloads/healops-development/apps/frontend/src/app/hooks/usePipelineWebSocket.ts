import { useState, useEffect } from "react";
import type { PipelineStatus } from "../_libs/mockData";

interface PipelineEvent {
  commitId: string;
  status: PipelineStatus;
  stage: string;
  progress: number;
  message: string;
  timestamp: string;
}

const STAGES = [
  { name: "Installing dependencies", duration: 3000 },
  { name: "Running linter", duration: 2000 },
  { name: "Building project", duration: 4000 },
  { name: "Running unit tests", duration: 3000 },
  { name: "Running E2E tests", duration: 5000 },
  { name: "Deploying to staging", duration: 2000 },
];

export const usePipelineWebSocket = (commitId: string | null, isRunning: boolean) => {
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!commitId || !isRunning) {
      setEvents([]);
      setCurrentStage(null);
      setProgress(0);
      setConnected(false);
      return;
    }

    setConnected(true);
    let stageIndex = 0;
    let cancelled = false;

    const simulateStage = () => {
      if (cancelled || stageIndex >= STAGES.length) return;

      const stage = STAGES[stageIndex];
      const event: PipelineEvent = {
        commitId,
        status: "running",
        stage: stage.name,
        progress: Math.round(((stageIndex + 1) / STAGES.length) * 100),
        message: `${stage.name}...`,
        timestamp: new Date().toLocaleTimeString(),
      };

      setCurrentStage(stage.name);
      setProgress(event.progress);
      setEvents((prev) => [...prev, event]);

      stageIndex++;
      if (stageIndex < STAGES.length) {
        setTimeout(simulateStage, stage.duration);
      }
    };

    // Start after a small delay to feel realistic
    const timeout = setTimeout(simulateStage, 500);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [commitId, isRunning]);

  return { events, currentStage, progress, connected };
};
