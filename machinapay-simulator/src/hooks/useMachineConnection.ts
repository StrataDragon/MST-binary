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
  ChainStage,
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

export type MachineConnection = {
  connectionStatus: ConnectionStatus;
  robotState: RobotState;
  phaseProgress: number;
  currentJob: StartJobMessage | null;
  timeline: TimelineStep[];
  lastResult: JobCompletedMessage | JobFailedMessage | null;
  executionSeconds: number;
  /** Where the object currently is in the animation, 0 = source, 1 = target. */
  objectCarryProgress: number;
  isMockMode: boolean;
  /** Simulated battery level, drained by real distance travelled on completed/failed jobs. */
  batteryPercent: number;
  /** Dev-only helper, wired to buttons that only render in mock mode. */
  sendTestJob: (taskType: TaskType, simulateFailure?: boolean) => void;
  chainStage: ChainStage | null;
  txHash: string | null;
  chainReward: string | null;
};

export function useMachineConnection(): MachineConnection {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("CONNECTING");
  const [robotState, setRobotState] = useState<RobotState>("IDLE");
  const [phaseProgress, setPhaseProgress] = useState(0);
  const [currentJob, setCurrentJob] = useState<StartJobMessage | null>(null);
  const [timeline, setTimeline] = useState<TimelineStep[]>(buildTimeline(null));
  const [lastResult, setLastResult] = useState<JobCompletedMessage | JobFailedMessage | null>(
    null
  );
  const [executionSeconds, setExecutionSeconds] = useState(0);
  const [objectCarryProgress, setObjectCarryProgress] = useState(0);
  const [batteryPercent, setBatteryPercent] = useState(100);
  const [chainStage, setChainStage] = useState<ChainStage | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [chainReward, setChainReward] = useState<string | null>(null);


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

  const resetToIdle = useCallback(() => {
    setRobotState("IDLE");
    setPhaseProgress(0);
    setCurrentJob(null);
    setTimeline(buildTimeline(null));
    setObjectCarryProgress(0);
    setExecutionSeconds(0);
    setChainStage(null);
    setTxHash(null);
    setChainReward(null);
    // BUG FIX: this used to be left set from the previous job, so
    // "Result Sent to Backend" stayed checked in the timeline even once the
    // machine was back at IDLE with no active job. IDLE must mean every
    // job-specific indicator, including this one, is cleared.
    setLastResult(null);
  }, []);

  const handleStartJob = useCallback(
    (msg: StartJobMessage) => {
      // Guard against a second START_JOB arriving mid-run: the simulator must not silently cancel a running job
      if (robotState !== "IDLE" && robotState !== "COMPLETED" && robotState !== "FAILED") {
        console.warn(`[simulator] Ignored START_JOB for ${msg.jobId} because machine is busy in state ${robotState}`);
        return;
      }

      window.clearTimeout(resetTimerRef.current);
      jobRunnerRef.current?.cancel();
      cancelledJobIds.current.delete(msg.jobId);

      setCurrentJob(msg);
      setChainStage("ESCROW_FUNDED");
      if (msg.reward) setChainReward(msg.reward);
      setLastResult(null);
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
          resetTimerRef.current = window.setTimeout(resetToIdle, config.autoResetDelayMs);
        },
      });
    },
    [resetToIdle, send, drainBattery]
  );

  const handleIncoming = useCallback(
    (msg: IncomingMessage) => {
      if ("machineId" in msg && msg.machineId && msg.machineId !== config.machineId) {
        console.warn(`[simulator] Ignored ${msg.type} for machine ${msg.machineId} (this machine is ${config.machineId})`);
        return;
      }

      switch (msg.type) {
        case "START_JOB":
          handleStartJob(msg);
          break;
        case "CHAIN_UPDATE":
          setChainStage(msg.stage);
          if (msg.txHash) setTxHash(msg.txHash);
          if (msg.amount) setChainReward(msg.amount);
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
        case "MACHINE_ONLINE_ACK":
          console.log(`[simulator] Backend acknowledged MACHINE_ONLINE for ${msg.machineId}`);
          setConnectionStatus("CONNECTED");
          break;
        case "PING":
          // no-op; HEARTBEAT loop covers liveness reporting
          break;
      }
    },
    [handleStartJob, resetToIdle, robotState]
  );

  // Connection lifecycle: real WebSocket, or mock backend wiring.
  useEffect(() => {
    console.log(
      `[machinapay-simulator] Startup config: wsUrl=${config.simulatorWsUrl}, machineId=${config.machineId}, mockMode=${config.mockMode}`
    );

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
      console.log(`[simulator] Connecting to backend WebSocket at ${config.simulatorWsUrl}...`);
      const ws = new WebSocket(config.simulatorWsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[simulator] WebSocket opened to ${config.simulatorWsUrl}. Sending MACHINE_ONLINE and awaiting ACK...`);
        // Stay in CONNECTING until MACHINE_ONLINE is acknowledged by backend
        setConnectionStatus("CONNECTING");
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

      ws.onclose = (ev) => {
        if (cancelled) return;
        console.warn(`[simulator] WebSocket connection closed (code ${ev.code}). Reconnecting in 2s...`);
        setConnectionStatus("DISCONNECTED");
        retryTimer = window.setTimeout(connect, 2000);
      };

      ws.onerror = (err) => {
        console.error(`[simulator] WebSocket error on ${config.simulatorWsUrl}:`, err);
        setConnectionStatus("DISCONNECTED");
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

  return {
    connectionStatus,
    robotState,
    phaseProgress,
    currentJob,
    timeline,
    lastResult,
    executionSeconds,
    objectCarryProgress,
    isMockMode: config.mockMode,
    batteryPercent,
    sendTestJob,
    chainStage,
    txHash,
    chainReward,
  };
}

export type { Position };
