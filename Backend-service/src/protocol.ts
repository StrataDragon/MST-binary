/**
 * MachinaPay — Integration Protocol
 * ----------------------------------
 * This file is the contract between:
 *   - Member 2 (this robot simulator, running standalone on Laptop 2)
 *   - Member 3 (machine agent / verifier backend, which relays jobs over WS)
 *   - Member 4 (main frontend, which triggers jobs from Laptop 1)
 *
 * The simulator NEVER talks to the blockchain and NEVER talks to the
 * frontend directly. It only speaks this protocol over one WebSocket
 * connection to the backend. Everything below is transport-agnostic JSON.
 */

export type Position = {
  x: number;
  y: number;
};

export type TaskType =
  | "MOVE_OBJECT"
  | "PICK_AND_PLACE"
  | "LOAD_AND_DUMP"
  | "DELIVERY"
  | "PACKAGE_TRANSPORT"
  | "COLOR_SORTING";

export type RobotState =
  | "IDLE"
  | "JOB_RECEIVED"
  | "MOVING_TO_OBJECT"
  | "PICKING_OBJECT"
  | "OBJECT_PICKED"
  | "MOVING_TO_TARGET"
  | "DROPPING_OBJECT"
  | "COMPLETED"
  | "FAILED";

// ---------------------------------------------------------------------------
// INCOMING — backend -> simulator
// ---------------------------------------------------------------------------

export type StartJobMessage = {
  type: "START_JOB";
  jobId: string;
  machineId: string;
  taskType: TaskType;
  reward?: string;
  source: Position;
  target: Position;
  /** Optional test hook: forces a FAILED result partway through execution. */
  simulateFailure?: boolean;
};

export type CancelJobMessage = {
  type: "CANCEL_JOB";
  jobId: string;
  machineId: string;
};

export type ResetMachineMessage = {
  type: "RESET_MACHINE";
  machineId: string;
};

export type ChainStage = "ESCROW_FUNDED" | "PROOF_SUBMITTED" | "VERIFIED" | "PAID" | "REFUNDED";

export type ChainUpdateMessage = {
  type: "CHAIN_UPDATE";
  jobId: string;
  machineId: string;
  stage: ChainStage;
  txHash?: string;
  amount?: string;
};

export type PingMessage = {
  type: "PING";
};

export type MachineOnlineAckMessage = {
  type: "MACHINE_ONLINE_ACK";
  machineId: string;
};

export type IncomingMessage =
  | StartJobMessage
  | CancelJobMessage
  | ResetMachineMessage
  | PingMessage
  | ChainUpdateMessage
  | MachineOnlineAckMessage;


// ---------------------------------------------------------------------------
// OUTGOING — simulator -> backend
// ---------------------------------------------------------------------------

export type MachineOnlineMessage = {
  type: "MACHINE_ONLINE";
  machineId: string;
  timestamp: string;
};

export type JobAcceptedMessage = {
  type: "JOB_ACCEPTED";
  jobId: string;
  machineId: string;
};

export type JobStartedMessage = {
  type: "JOB_STARTED";
  jobId: string;
  machineId: string;
  timestamp: string;
};

export type RobotStateChangedMessage = {
  type: "ROBOT_STATE_CHANGED";
  jobId: string;
  machineId: string;
  state: RobotState;
  timestamp: string;
};

export type JobCompletedMessage = {
  type: "JOB_COMPLETED";
  jobId: string;
  machineId: string;
  status: "SUCCESS";
  taskType: TaskType;
  sourcePosition: Position;
  targetPosition: Position;
  finalPosition: Position;
  objectDelivered: boolean;
  completedAt: string;
};

export type JobFailedMessage = {
  type: "JOB_FAILED";
  jobId: string;
  machineId: string;
  status: "FAILED";
  reason: string;
  failedAt: string;
};

export type HeartbeatMessage = {
  type: "HEARTBEAT";
  machineId: string;
  state: RobotState;
  timestamp: string;
};

export type OutgoingMessage =
  | MachineOnlineMessage
  | JobAcceptedMessage
  | JobStartedMessage
  | RobotStateChangedMessage
  | JobCompletedMessage
  | JobFailedMessage
  | HeartbeatMessage;

// ---------------------------------------------------------------------------
// Type guards (handy for Member 3's backend + this app)
// ---------------------------------------------------------------------------

export function isIncomingMessage(data: unknown): data is IncomingMessage {
  if (typeof data !== "object" || data === null) return false;
  const t = (data as { type?: unknown }).type;
  return (
    t === "START_JOB" ||
    t === "CANCEL_JOB" ||
    t === "RESET_MACHINE" ||
    t === "PING" ||
    t === "CHAIN_UPDATE" ||
    t === "MACHINE_ONLINE_ACK"
  );
}

