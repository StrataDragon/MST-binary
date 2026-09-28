import { useCallback, useEffect, useRef, useState } from "react";
import { config } from "../config";
import type {
  IncomingMessage,
  JobCompletedMessage,
  JobFailedMessage,
  OutgoingMessage,
  Position,
  RobotState,
  StartJobMessage,
} from "../integration/protocol";
import { isIncomingMessage } from "../integration/protocol";
import { buildSampleJob, mockBackend } from "../integration/mockBackend";
import { runJob, JOB_PHASES } from "../state/robotStateMachine";
import { getTaskConfig } from "../state/taskConfig";
import type { TaskType } from "../integration/protocol";

export type TimelineStep = {
  state: RobotState;
  label: string;
  done: boolean;
};

/**
 * Every task type reuses the exact same RobotState sequence (JOB_PHASES) —
 * only the copy shown for each phase changes, sourced from taskConfig. This
 * is how a PICK_AND_PLACE job reads as "Approaching Object" while a
 * LOAD_AND_DUMP job reads as "Approaching Pile" without needing separate
 * protocol states for each task.
 */
function buildTimeline(taskType: TaskType | null): TimelineStep[] {
  const labels = getTaskConfig(taskType ?? undefined).phaseLabels;
  return JOB_PHASES.map((state) => ({ state, label: labels[state], done: false }));
}

export type ConnectionStatus = "CONNECTING" | "CONNECTED" | "DISCONNECTED" | "MOCK";

export type VerificationInfo = {
  submitted: boolean;
  submitProofTx?: string;
  passed?: boolean;
  settleTx?: string;
  attestationTx?: string;
  error?: string;
};

export type MachineConnection = {
  connectionStatus: ConnectionStatus;
  backendOnline: boolean | null;
  robotState: RobotState;
  phaseProgress: number;
  currentJob: StartJobMessage | null;
  timeline: TimelineStep[];
  lastResult: JobCompletedMessage | JobFailedMessage | null;
  verification: VerificationInfo | null;
  executionSeconds: number;
  /** Where the object currently is in the animation, 0 = source, 1 = target. */
  objectCarryProgress: number;
  isMockMode: boolean;
  /** Simulated battery level, drained by real distance travelled on completed/failed jobs. */
  batteryPercent: number;
  /** Dev-only helper, wired to buttons that only render in mock mode. */
  sendTestJob: (taskType: TaskType, simulateFailure?: boolean) => void;
  /** Dispatches an on-chain job by accepting it via backend and launching the 3D execution */
  dispatchOnChainJob?: (jobId: string) => Promise<void>;
};

export function useMachineConnection(): MachineConnection {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("CONNECTING");
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [robotState, setRobotState] = useState<RobotState>("IDLE");
  const [phaseProgress, setPhaseProgress] = useState(0);
  const [currentJob, setCurrentJob] = useState<StartJobMessage | null>(null);
  const [timeline, setTimeline] = useState<TimelineStep[]>(buildTimeline(null));
  const [lastResult, setLastResult] = useState<JobCompletedMessage | JobFailedMessage | null>(
    null
  );
  const [verification, setVerification] = useState<VerificationInfo | null>(null);
  const [executionSeconds, setExecutionSeconds] = useState(0);
  const [objectCarryProgress, setObjectCarryProgress] = useState(0);
  const [batteryPercent, setBatteryPercent] = useState(100);

  const wsRef = useRef<WebSocket | null>(null);
  const jobRunnerRef = useRef<{ cancel: () => void } | null>(null);
  const cancelledJobIds = useRef<Set<string>>(new Set());
  const jobStartTimeRef = useRef<number>(0);
  const execTimerRef = useRef<number | undefined>(undefined);
  const resetTimerRef = useRef<number | undefined>(undefined);
  const heartbeatRef = useRef<number | undefined>(undefined);

  const send = useCallback((msg: OutgoingMessage) => {
    if (config.mockMode) {
      mockBackend.receive(msg);
      return;
    }
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  /** Real, distance-derived battery drain — never randomized. Every completed
   * or failed job takes 1-4% depending on how far the machine actually
   * travelled, floored so the demo never shows a dead machine. */
  const drainBattery = useCallback((source: Position, target: Position) => {
    const distance = Math.hypot(target.x - source.x, target.y - source.y);
    const drain = Math.min(4, Math.max(1, distance * 0.002));
    setBatteryPercent((prev) => Math.max(12, Number((prev - drain).toFixed(1))));
  }, []);

  const submitEvidenceToBackend = useCallback(
    async (
      jobId: string,
      result: "success" | "fail",
      source: Position,
      target: Position
    ) => {
      if (!config.backendHttpUrl) return;
      try {
        const res = await fetch(`${config.backendHttpUrl}/machine/jobs/${jobId}/evidence`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            packageId: "A",
            target: { zone: "green", x: target.x, y: target.y },
            finalPosition: result === "success" ? { x: target.x, y: target.y } : { x: source.x, y: source.y },
            delivered: result === "success",
            result,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setVerification({
            submitted: true,
            submitProofTx: data.submitProofTx,
            passed: data.verification?.passed,
            settleTx: data.verification?.settleTx,
            attestationTx: data.verification?.attestationTx,
          });
        } else {
          const err = await res.json().catch(() => ({}));
          setVerification({
            submitted: false,
            error: err?.error || `HTTP ${res.status}`,
          });
        }
      } catch (err: any) {
        console.debug("[Member 3 Backend not reached]", err?.message);
      }
    },
    []
  );

  const resetToIdle = useCallback(() => {
    setRobotState("IDLE");
    setPhaseProgress(0);
    setCurrentJob(null);
    setTimeline(buildTimeline(null));
    setObjectCarryProgress(0);
    setExecutionSeconds(0);
    // BUG FIX: this used to be left set from the previous job, so
    // "Result Sent to Backend" stayed checked in the timeline even once the
    // machine was back at IDLE with no active job. IDLE must mean every
    // job-specific indicator, including this one, is cleared.
    setLastResult(null);
    setVerification(null);
  }, []);

  const handleStartJob = useCallback(
    (msg: StartJobMessage) => {
      window.clearTimeout(resetTimerRef.current);
      jobRunnerRef.current?.cancel();
      cancelledJobIds.current.delete(msg.jobId);

      setCurrentJob(msg);
      setLastResult(null);
      setVerification(null);
      setTimeline(buildTimeline(msg.taskType));
      setObjectCarryProgress(0);

      send({ type: "JOB_ACCEPTED", jobId: msg.jobId, machineId: msg.machineId });

      jobStartTimeRef.current = performance.now();
      window.clearInterval(execTimerRef.current);
      execTimerRef.current = window.setInterval(() => {
        setExecutionSeconds((performance.now() - jobStartTimeRef.current) / 1000);
      }, 100);

      send({
        type: "JOB_STARTED",
        jobId: msg.jobId,
        machineId: msg.machineId,
        timestamp: new Date().toISOString(),
      });

      jobRunnerRef.current = runJob({
        simulateFailure: msg.simulateFailure,
        failureReason: getTaskConfig(msg.taskType).failureReason,
        isCancelled: () => cancelledJobIds.current.has(msg.jobId),
        onPhaseEnter: (phase) => {
          setRobotState(phase);
          setPhaseProgress(0);
          setTimeline((prev) =>
            prev.map((step) => {
              const stepIndex = JOB_PHASES.indexOf(step.state);
              const phaseIndex = JOB_PHASES.indexOf(phase);
              return { ...step, done: stepIndex < phaseIndex || step.state === phase };
            })
          );
          send({
            type: "ROBOT_STATE_CHANGED",
            jobId: msg.jobId,
            machineId: msg.machineId,
            state: phase,
            timestamp: new Date().toISOString(),
          });
        },
        onTick: (phase, progress) => {
          setPhaseProgress(progress);
          if (phase === "MOVING_TO_OBJECT") setObjectCarryProgress(0);
          if (phase === "OBJECT_PICKED") setObjectCarryProgress(0);
          if (phase === "MOVING_TO_TARGET") setObjectCarryProgress(progress);
          if (phase === "DROPPING_OBJECT") setObjectCarryProgress(1);
        },
        onFailed: (reason) => {
          window.clearInterval(execTimerRef.current);
          setRobotState("FAILED");
          drainBattery(msg.source, msg.target);
          const result: JobFailedMessage = {
            type: "JOB_FAILED",
            jobId: msg.jobId,
            machineId: msg.machineId,
            status: "FAILED",
            reason,
            failedAt: new Date().toISOString(),
          };
          setLastResult(result);
          send(result);
          submitEvidenceToBackend(msg.jobId, "fail", msg.source, msg.target);
          resetTimerRef.current = window.setTimeout(resetToIdle, config.autoResetDelayMs);
        },
        onCompleted: () => {
          window.clearInterval(execTimerRef.current);
          setRobotState("COMPLETED");
          setObjectCarryProgress(1);
          drainBattery(msg.source, msg.target);
          const result: JobCompletedMessage = {
            type: "JOB_COMPLETED",
            jobId: msg.jobId,
            machineId: msg.machineId,
            status: "SUCCESS",
            taskType: msg.taskType,
            sourcePosition: msg.source,
            targetPosition: msg.target,
            finalPosition: msg.target,
            objectDelivered: true,
            completedAt: new Date().toISOString(),
          };
          setLastResult(result);
          send(result);
          submitEvidenceToBackend(msg.jobId, "success", msg.source, msg.target);
          resetTimerRef.current = window.setTimeout(resetToIdle, config.autoResetDelayMs);
        },
      });
    },
    [resetToIdle, send, drainBattery, submitEvidenceToBackend]
  );

  const handleIncoming = useCallback(
    (msg: IncomingMessage) => {
      switch (msg.type) {
        case "START_JOB":
          handleStartJob(msg);
          break;
        case "CANCEL_JOB":
          cancelledJobIds.current.add(msg.jobId);
          jobRunnerRef.current?.cancel();
          window.clearInterval(execTimerRef.current);
          resetToIdle();
          break;
        case "RESET_MACHINE":
          jobRunnerRef.current?.cancel();
          window.clearInterval(execTimerRef.current);
          window.clearTimeout(resetTimerRef.current);
          resetToIdle();
          break;
        case "PING":
          // no-op; HEARTBEAT loop covers liveness reporting
          break;
      }
    },
    [handleStartJob, resetToIdle]
  );

  // Connection lifecycle: real WebSocket, or mock backend wiring.
  useEffect(() => {
    if (config.mockMode) {
      setConnectionStatus("MOCK");
      const unsubscribe = mockBackend.onMessage(handleIncoming);
      send({ type: "MACHINE_ONLINE", machineId: config.machineId, timestamp: new Date().toISOString() });
      return unsubscribe;
    }

    let cancelled = false;
    let retryTimer: number | undefined;

    const connect = () => {
      if (cancelled) return;
      setConnectionStatus("CONNECTING");
      const ws = new WebSocket(config.simulatorWsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus("CONNECTED");
        send({ type: "MACHINE_ONLINE", machineId: config.machineId, timestamp: new Date().toISOString() });
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (isIncomingMessage(data)) handleIncoming(data);
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        setConnectionStatus("DISCONNECTED");
        retryTimer = window.setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check if Member 3's backend HTTP service is reachable
  useEffect(() => {
    let mounted = true;
    const checkBackend = async () => {
      try {
        const res = await fetch(`${config.backendHttpUrl}/health`, { signal: AbortSignal.timeout(2500) });
        if (mounted) setBackendOnline(res.ok);
      } catch {
        if (mounted) setBackendOnline(false);
      }
    };
    checkBackend();
    const timer = setInterval(checkBackend, 6000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  // Heartbeat, independent of job execution.
  useEffect(() => {
    heartbeatRef.current = window.setInterval(() => {
      send({
        type: "HEARTBEAT",
        machineId: config.machineId,
        state: robotState,
        timestamp: new Date().toISOString(),
      });
    }, config.heartbeatIntervalMs);
    return () => window.clearInterval(heartbeatRef.current);
  }, [robotState, send]);

  const sendTestJob = useCallback(
    (taskType: TaskType, simulateFailure = false) => {
      const job = buildSampleJob(taskType, simulateFailure) as StartJobMessage;
      if (config.mockMode) {
        mockBackend.push(job);
      } else {
        handleIncoming(job);
      }
    },
    [handleIncoming]
  );

  const dispatchOnChainJob = useCallback(
    async (jobId: string) => {
      try {
        const res = await fetch(`${config.backendHttpUrl}/machine/jobs/${jobId}/accept`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Backend failed to accept job on-chain");
        }

        handleIncoming({
          type: "START_JOB",
          jobId,
          machineId: config.machineId,
          taskType: "MOVE_OBJECT",
          reward: "100",
          source: { x: 100, y: 300 },
          target: { x: 600, y: 300 },
        });
      } catch (e: any) {
        console.error("dispatchOnChainJob error:", e);
        throw e;
      }
    },
    [handleIncoming]
  );

  return {
    connectionStatus,
    backendOnline,
    robotState,
    phaseProgress,
    currentJob,
    timeline,
    lastResult,
    verification,
    executionSeconds,
    objectCarryProgress,
    isMockMode: config.mockMode,
    batteryPercent,
    sendTestJob,
    dispatchOnChainJob,
  };
}

export type { Position };
