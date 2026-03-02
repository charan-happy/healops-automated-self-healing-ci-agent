"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSocket } from "./useSocket";

export interface RepairEvent {
  jobId: string;
  type: "started" | "stage" | "completed" | "failed" | "escalated";
  stage?: string;
  message?: string;
  progress?: number;
  status?: string;
  prUrl?: string;
  reason?: string;
  issueUrl?: string;
  failureId?: string;
  timestamp: string;
}

interface UseRepairEventsReturn {
  events: RepairEvent[];
  currentStage: string | null;
  progress: number;
  connected: boolean;
  clearEvents: () => void;
}

export function useRepairEvents(
  jobId?: string | null,
  userId?: string,
): UseRepairEventsReturn {
  const { connected, on, off } = useSocket(userId);
  const [events, setEvents] = useState<RepairEvent[]>([]);
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const jobIdRef = useRef(jobId);
  jobIdRef.current = jobId;

  useEffect(() => {
    const handleStarted = (...args: unknown[]) => {
      const data = args[0] as { jobId: string; failureId?: string };
      if (jobIdRef.current && data.jobId !== jobIdRef.current) return;
      const event: RepairEvent = {
        jobId: data.jobId,
        type: "started",
        failureId: data.failureId,
        progress: 0,
        timestamp: new Date().toISOString(),
      };
      setEvents((prev) => [...prev, event]);
      setCurrentStage("Starting repair");
      setProgress(0);
    };

    const handleStage = (...args: unknown[]) => {
      const data = args[0] as {
        jobId: string;
        stage: string;
        message?: string;
        progress?: number;
      };
      if (jobIdRef.current && data.jobId !== jobIdRef.current) return;
      const event: RepairEvent = {
        jobId: data.jobId,
        type: "stage",
        stage: data.stage,
        message: data.message,
        progress: data.progress,
        timestamp: new Date().toISOString(),
      };
      setEvents((prev) => [...prev, event]);
      setCurrentStage(data.stage);
      if (data.progress != null) setProgress(data.progress);
    };

    const handleCompleted = (...args: unknown[]) => {
      const data = args[0] as {
        jobId: string;
        status?: string;
        prUrl?: string;
      };
      if (jobIdRef.current && data.jobId !== jobIdRef.current) return;
      const event: RepairEvent = {
        jobId: data.jobId,
        type: "completed",
        status: data.status,
        prUrl: data.prUrl,
        progress: 100,
        timestamp: new Date().toISOString(),
      };
      setEvents((prev) => [...prev, event]);
      setCurrentStage(null);
      setProgress(100);
    };

    const handleFailed = (...args: unknown[]) => {
      const data = args[0] as { jobId: string; reason?: string };
      if (jobIdRef.current && data.jobId !== jobIdRef.current) return;
      const event: RepairEvent = {
        jobId: data.jobId,
        type: "failed",
        reason: data.reason,
        timestamp: new Date().toISOString(),
      };
      setEvents((prev) => [...prev, event]);
      setCurrentStage(null);
    };

    const handleEscalated = (...args: unknown[]) => {
      const data = args[0] as { jobId: string; issueUrl?: string };
      if (jobIdRef.current && data.jobId !== jobIdRef.current) return;
      const event: RepairEvent = {
        jobId: data.jobId,
        type: "escalated",
        issueUrl: data.issueUrl,
        timestamp: new Date().toISOString(),
      };
      setEvents((prev) => [...prev, event]);
      setCurrentStage(null);
    };

    on("repair:started", handleStarted);
    on("repair:stage", handleStage);
    on("repair:completed", handleCompleted);
    on("repair:failed", handleFailed);
    on("repair:escalated", handleEscalated);

    return () => {
      off("repair:started", handleStarted);
      off("repair:stage", handleStage);
      off("repair:completed", handleCompleted);
      off("repair:failed", handleFailed);
      off("repair:escalated", handleEscalated);
    };
  }, [on, off]);

  const clearEvents = useCallback(() => {
    setEvents([]);
    setCurrentStage(null);
    setProgress(0);
  }, []);

  return { events, currentStage, progress, connected, clearEvents };
}
