import { WebSocket } from "ws";
import { formatEther } from "ethers";
import { getEscrow, cfg } from "./config";
import {
  IncomingMessage,
  OutgoingMessage,
  StartJobMessage,
  ChainUpdateMessage,
  Position,
  TaskType,
} from "./protocol";
import {
  acceptJobOnly,
  startExecutionOnly,
  submitSimulatorEvidenceAndProof,
  MACHINE_ID_TEXT,
} from "./machineAgent";
import { verifyAndSettle } from "./verifierService";
import { storeEvidence } from "./evidenceStore";
import {
  updateProcessedJob,
  isJobActionDone,
} from "./jobPersistence";
import { upsertJob } from "./store";

export interface QueueJobItem {
  jobId: string;
  machineId: string;
  taskType: TaskType;
  reward?: string;
  source: Position;
  target: Position;
  simulateFailure?: boolean;
}

// Track connections per machineId (e.g. "M-042")
const machineSockets = new Map<string, WebSocket>();
const machineStatus = new Map<string, "IDLE" | "BUSY">();
const machineQueues = new Map<string, QueueJobItem[]>();
const activeJobPerMachine = new Map<string, QueueJobItem>();

export type SimulatorMachineStatus = {
  machineId: string;
  connected: boolean;
  robotState: string;
  activeJobId: string | null;
  queueLength: number;
  updatedAt: string;
};

const simulatorStatus = new Map<string, SimulatorMachineStatus>();

function updateSimulatorStatus(
  machineId: string,
  update: Partial<Omit<SimulatorMachineStatus, "machineId">>
) {
  const current = simulatorStatus.get(machineId);
  simulatorStatus.set(machineId, {
    machineId,
    connected: current?.connected ?? false,
    robotState: current?.robotState ?? "IDLE",
    activeJobId: current?.activeJobId ?? null,
    queueLength: machineQueues.get(machineId)?.length ?? 0,
    updatedAt: new Date().toISOString(),
    ...update,
  });
}

/** Read-only status consumed by the customer dashboard. */
export function getSimulatorStatuses(): SimulatorMachineStatus[] {
  const machineIds = new Set([...simulatorStatus.keys(), ...machineSockets.keys(), ...machineQueues.keys()]);
  return [...machineIds]
    .map((machineId) => simulatorStatus.get(machineId) ?? {
      machineId,
      connected: false,
      robotState: "OFFLINE",
      activeJobId: null,
      queueLength: machineQueues.get(machineId)?.length ?? 0,
      updatedAt: new Date(0).toISOString(),
    })
    .sort((a, b) => a.machineId.localeCompare(b.machineId));
}

export function getJobQueueInfo(jobId: string): {
  status: "RUNNING" | "QUEUED" | "NOT_FOUND";
  queuePosition: number;
  totalQueue: number;
  machineId?: string;
} {
  const normId = jobId.toLowerCase();
  for (const [mId, activeJob] of activeJobPerMachine.entries()) {
    if (activeJob.jobId.toLowerCase() === normId) {
      return {
        status: "RUNNING",
        queuePosition: 0,
        totalQueue: (machineQueues.get(mId)?.length || 0) + 1,
        machineId: mId,
      };
    }
  }
  for (const [mId, queue] of machineQueues.entries()) {
    const idx = queue.findIndex((j) => j.jobId.toLowerCase() === normId);
    if (idx !== -1) {
      return {
        status: "QUEUED",
        queuePosition: idx + 1,
        totalQueue: queue.length,
        machineId: mId,
      };
    }
  }
  return { status: "NOT_FOUND", queuePosition: -1, totalQueue: 0 };
}

export function registerMachineSocket(machineId: string, ws: WebSocket) {
  machineSockets.set(machineId, ws);
  if (!machineStatus.has(machineId)) {
    machineStatus.set(machineId, "IDLE");
  }
  updateSimulatorStatus(machineId, { connected: true });
  console.log(`[simulator-relay] Machine ${machineId} socket registered. Ready.`);
}

export function removeMachineSocket(ws: WebSocket) {
  for (const [id, socket] of machineSockets.entries()) {
    if (socket === ws) {
      machineSockets.delete(id);
      updateSimulatorStatus(id, { connected: false, robotState: "OFFLINE", activeJobId: null });
      console.log(`[simulator-relay] Machine ${id} socket disconnected.`);
      break;
    }
  }
}

export function sendToSimulator(machineId: string, msg: IncomingMessage): boolean {
  const ws = machineSockets.get(machineId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

export function sendChainUpdate(
  machineId: string,
  update: {
    jobId: string;
    stage: "ESCROW_FUNDED" | "PROOF_SUBMITTED" | "VERIFIED" | "PAID" | "REFUNDED";
    txHash?: string;
    amount?: string;
  }
) {
  const msg: ChainUpdateMessage = {
    type: "CHAIN_UPDATE",
    jobId: update.jobId,
    machineId,
    stage: update.stage,
    txHash: update.txHash,
    amount: update.amount,
  };
  sendToSimulator(machineId, msg);
}

export function enqueueJob(job: QueueJobItem) {
  const list = machineQueues.get(job.machineId) || [];
  // Avoid duplicate queue entries
  if (!list.some((j) => j.jobId.toLowerCase() === job.jobId.toLowerCase())) {
    list.push(job);
    machineQueues.set(job.machineId, list);
    updateSimulatorStatus(job.machineId, { queueLength: list.length });
    console.log(
      `[simulator-relay] Enqueued job ${job.jobId.slice(0, 10)}… for machine ${job.machineId} (queue length: ${list.length})`
    );
  }
  dispatchNextJob(job.machineId);
}

export async function dispatchNextJob(machineId: string) {
  const ws = machineSockets.get(machineId);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }

  const currentStatus = machineStatus.get(machineId) || "IDLE";
  if (currentStatus === "BUSY") {
    return;
  }

  const list = machineQueues.get(machineId) || [];
  if (list.length === 0) {
    return;
  }

  const job = list.shift()!;
  machineQueues.set(machineId, list);
  machineStatus.set(machineId, "BUSY");
  activeJobPerMachine.set(machineId, job);
  updateSimulatorStatus(machineId, {
    connected: true,
    robotState: "JOB_RECEIVED",
    activeJobId: job.jobId,
    queueLength: list.length,
  });

  console.log(
    `[simulator-relay] Dispatching job ${job.jobId.slice(0, 10)}… to machine ${machineId}`
  );

  try {
    const escrow = getEscrow();
    const onChainJob = await escrow.getJob(job.jobId);
    const onChainState = Number(onChainJob.state);

    // On-chain transitions: FUNDED (1) -> accept -> startExecution
    if (onChainState === 1 && !isJobActionDone(job.jobId, "accepted")) {
      console.log(`[simulator-relay] Calling escrow.acceptJob for ${job.jobId.slice(0, 10)}…`);
      await acceptJobOnly(job.jobId, machineId);
      updateProcessedJob(job.jobId, { accepted: true, stage: "accepted" });
    }

    const stateAfterAccept = Number((await escrow.getJob(job.jobId)).state);
    if (stateAfterAccept === 2 && !isJobActionDone(job.jobId, "executing")) {
      console.log(`[simulator-relay] Calling escrow.startExecution for ${job.jobId.slice(0, 10)}…`);
      await startExecutionOnly(job.jobId);
      updateProcessedJob(job.jobId, { executing: true, stage: "executing" });
    }

    const rewardFormatted = job.reward || formatEther(onChainJob.reward);

    // Push CHAIN_UPDATE for ESCROW_FUNDED
    sendChainUpdate(machineId, {
      jobId: job.jobId,
      stage: "ESCROW_FUNDED",
      amount: rewardFormatted,
    });

    // Send START_JOB to the simulator
    const startMsg: StartJobMessage = {
      type: "START_JOB",
      jobId: job.jobId,
      machineId,
      taskType: job.taskType,
      reward: rewardFormatted,
      source: job.source,
      target: job.target,
      simulateFailure: Boolean(job.simulateFailure),
    };

    sendToSimulator(machineId, startMsg);
    console.log(
      `[simulator-relay] START_JOB sent to simulator for job ${job.jobId.slice(0, 10)}… (simulateFailure=${Boolean(job.simulateFailure)})`
    );
  } catch (err) {
    console.error(`[simulator-relay] Error dispatching job ${job.jobId}:`, err);
    machineStatus.set(machineId, "IDLE");
    activeJobPerMachine.delete(machineId);
    updateSimulatorStatus(machineId, { robotState: "IDLE", activeJobId: null });
    // Try next in queue if any
    dispatchNextJob(machineId);
  }
}

export async function handleSimulatorMessage(ws: WebSocket, raw: string) {
  let msg: OutgoingMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    console.warn("[simulator-relay] Ignoring malformed JSON frame");
    return;
  }

  if (!msg || typeof msg !== "object" || !("type" in msg)) {
    return;
  }

  switch (msg.type) {
    case "MACHINE_ONLINE": {
      registerMachineSocket(msg.machineId, ws);
      machineStatus.set(msg.machineId, "IDLE");
      updateSimulatorStatus(msg.machineId, { connected: true, robotState: "IDLE", activeJobId: null });
      console.log(`[simulator-relay] MACHINE_ONLINE from ${msg.machineId} at ${msg.timestamp}`);
      dispatchNextJob(msg.machineId);
      break;
    }

    case "HEARTBEAT": {
      registerMachineSocket(msg.machineId, ws);
      updateSimulatorStatus(msg.machineId, { connected: true, robotState: msg.state });
      if (msg.state === "IDLE" && machineStatus.get(msg.machineId) !== "BUSY") {
        machineStatus.set(msg.machineId, "IDLE");
        dispatchNextJob(msg.machineId);
      }
      break;
    }

    case "JOB_ACCEPTED": {
      console.log(`[simulator-relay] JOB_ACCEPTED by machine ${msg.machineId} for job ${msg.jobId}`);
      upsertJob(msg.jobId, { stage: "accepted" });
      break;
    }

    case "JOB_STARTED": {
      console.log(`[simulator-relay] JOB_STARTED by machine ${msg.machineId} for job ${msg.jobId}`);
      upsertJob(msg.jobId, { stage: "executing" });
      break;
    }

    case "ROBOT_STATE_CHANGED": {
      upsertJob(msg.jobId, { stage: "executing" });
      updateSimulatorStatus(msg.machineId, {
        connected: true,
        robotState: msg.state,
        activeJobId: msg.jobId,
      });
      break;
    }


    case "JOB_COMPLETED": {
      console.log(`[simulator-relay] JOB_COMPLETED for job ${msg.jobId} by machine ${msg.machineId}`);
      const activeJob = activeJobPerMachine.get(msg.machineId);
      const evidence = {
        jobId: msg.jobId,
        machineId: msg.machineId,
        taskType: msg.taskType,
        sourcePosition: msg.sourcePosition,
        targetPosition: msg.targetPosition,
        finalPosition: msg.finalPosition,
        objectDelivered: msg.objectDelivered,
        completedAt: msg.completedAt,
        simulateFailure: false,
      };

      storeEvidence(msg.jobId, evidence);
      updateSimulatorStatus(msg.machineId, {
        connected: true,
        robotState: "COMPLETED",
        activeJobId: msg.jobId,
      });

      try {
        console.log(`[simulator-relay] Signing and submitting SUCCESS proof for job ${msg.jobId}…`);
        const submission = await submitSimulatorEvidenceAndProof(msg.jobId, evidence, "success");
        updateProcessedJob(msg.jobId, { proofSubmitted: true, stage: "proof_submitted" });

        sendChainUpdate(msg.machineId, {
          jobId: msg.jobId,
          stage: "PROOF_SUBMITTED",
          txHash: submission.submitProofTx,
        });

        console.log(`[simulator-relay] Triggering verifier consensus & settlement for job ${msg.jobId}…`);
        const verification = await verifyAndSettle({
          jobId: msg.jobId,
          proof: submission.proof,
          signature: submission.signature,
          evidence: submission.evidence,
        });

        sendChainUpdate(msg.machineId, {
          jobId: msg.jobId,
          stage: "VERIFIED",
          txHash: verification.attestationTx,
        });

        const escrow = getEscrow();
        const jobData = await escrow.getJob(msg.jobId);
        const rewardStr = formatEther(jobData.reward);

        sendChainUpdate(msg.machineId, {
          jobId: msg.jobId,
          stage: "PAID",
          txHash: verification.settleTx,
          amount: rewardStr,
        });

        updateProcessedJob(msg.jobId, {
          verified: true,
          settled: true,
          verdict: "PASS",
          stage: "paid",
        });

        console.log(`[simulator-relay] Successfully settled job ${msg.jobId}: PAYMENT RELEASED`);
      } catch (err) {
        console.error(`[simulator-relay] Error processing JOB_COMPLETED for ${msg.jobId}:`, err);
      } finally {
        activeJobPerMachine.delete(msg.machineId);
        machineStatus.set(msg.machineId, "IDLE");
        updateSimulatorStatus(msg.machineId, { activeJobId: null });
        dispatchNextJob(msg.machineId);
      }
      break;
    }

    case "JOB_FAILED": {
      console.log(`[simulator-relay] JOB_FAILED for job ${msg.jobId} by machine ${msg.machineId}: ${msg.reason}`);
      const activeJob = activeJobPerMachine.get(msg.machineId);
      const evidence = {
        jobId: msg.jobId,
        machineId: msg.machineId,
        taskType: activeJob?.taskType || "MOVE_OBJECT",
        sourcePosition: activeJob?.source || { x: 100, y: 300 },
        targetPosition: activeJob?.target || { x: 600, y: 300 },
        finalPosition: { x: -1, y: -1 },
        objectDelivered: false,
        completedAt: msg.failedAt,
        simulateFailure: true,
      };

      storeEvidence(msg.jobId, evidence);
      updateSimulatorStatus(msg.machineId, {
        connected: true,
        robotState: "FAILED",
        activeJobId: msg.jobId,
      });

      try {
        console.log(`[simulator-relay] Signing and submitting FAILED proof (result 0) for job ${msg.jobId}…`);
        const submission = await submitSimulatorEvidenceAndProof(msg.jobId, evidence, "fail");
        updateProcessedJob(msg.jobId, { proofSubmitted: true, stage: "proof_submitted" });

        sendChainUpdate(msg.machineId, {
          jobId: msg.jobId,
          stage: "PROOF_SUBMITTED",
          txHash: submission.submitProofTx,
        });

        console.log(`[simulator-relay] Triggering verifier for failed job ${msg.jobId}…`);
        const verification = await verifyAndSettle({
          jobId: msg.jobId,
          proof: submission.proof,
          signature: submission.signature,
          evidence: submission.evidence,
        });

        sendChainUpdate(msg.machineId, {
          jobId: msg.jobId,
          stage: "VERIFIED",
          txHash: verification.attestationTx,
        });

        sendChainUpdate(msg.machineId, {
          jobId: msg.jobId,
          stage: "REFUNDED",
          txHash: verification.settleTx,
        });

        updateProcessedJob(msg.jobId, {
          verified: true,
          settled: true,
          verdict: "FAIL",
          stage: "refunded",
        });

        console.log(`[simulator-relay] Successfully settled failed job ${msg.jobId}: CUSTOMER REFUNDED`);
      } catch (err) {
        console.error(`[simulator-relay] Error processing JOB_FAILED for ${msg.jobId}:`, err);
      } finally {
        activeJobPerMachine.delete(msg.machineId);
        machineStatus.set(msg.machineId, "IDLE");
        updateSimulatorStatus(msg.machineId, { activeJobId: null });
        dispatchNextJob(msg.machineId);
      }
      break;
    }
  }
}
