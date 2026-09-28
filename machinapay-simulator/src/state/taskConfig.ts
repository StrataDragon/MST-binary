import type { RobotState, TaskType } from "../integration/protocol";

/**
 * All 4 supported jobs share the exact same RobotState sequence (see
 * robotStateMachine.ts) — we deliberately do NOT add per-task protocol
 * states. What changes per task is purely presentational: what we call the
 * thing being handled, how heavy it is, which zone labels make sense, and
 * what a realistic failure reason looks like.
 *
 * Reusing one state machine for all 4 jobs is why a PICK_AND_PLACE and a
 * LOAD_AND_DUMP job look identical at the protocol level but read
 * differently on screen.
 */
export type TaskConfig = {
  taskType: TaskType;
  /** Short human label, e.g. for the job panel / mock controls. */
  label: string;
  /** Small distinct glyph per task, so the task selector and status chips
   * don't all show the same generic icon. */
  icon: string;
  /** What the carried thing is called in this job. */
  objectNoun: string;
  /** Zone marker labels for the source/target rings in the 3D scene. */
  sourceZoneLabel: string;
  targetZoneLabel: string;
  /** How heavy the carried thing is, in kg — feeds telemetry LOAD directly. */
  weightKg: number;
  /** Realistic JOB_FAILED reason for this task if simulateFailure is set. */
  failureReason: string;
  /** Per-phase copy, reusing the exact same RobotState keys for every task. */
  phaseLabels: Record<RobotState, string>;
};

const BASE_PHASE_LABELS: Record<RobotState, string> = {
  IDLE: "ONLINE — WAITING FOR JOB",
  JOB_RECEIVED: "Job Received",
  MOVING_TO_OBJECT: "Moving to Object",
  PICKING_OBJECT: "Picking Object",
  OBJECT_PICKED: "Object Picked",
  MOVING_TO_TARGET: "Moving to Target",
  DROPPING_OBJECT: "Dropping Object",
  COMPLETED: "Job Completed",
  FAILED: "Job Failed",
};

export const TASK_CONFIG: Record<TaskType, TaskConfig> = {
  MOVE_OBJECT: {
    taskType: "MOVE_OBJECT",
    label: "Move Object",
    icon: "📦",
    objectNoun: "crate",
    sourceZoneLabel: "SOURCE",
    targetZoneLabel: "DELIVERY ZONE",
    weightKg: 4.5,
    failureReason: "TARGET_NOT_REACHED",
    phaseLabels: {
      ...BASE_PHASE_LABELS,
      MOVING_TO_OBJECT: "Moving to Object",
      PICKING_OBJECT: "Picking Object",
      OBJECT_PICKED: "Object Picked",
      MOVING_TO_TARGET: "Moving to Target",
      DROPPING_OBJECT: "Dropping Object",
    },
  },
  PICK_AND_PLACE: {
    taskType: "PICK_AND_PLACE",
    label: "Pick & Place",
    icon: "🛢️",
    objectNoun: "barrel",
    sourceZoneLabel: "PICKUP ZONE",
    targetZoneLabel: "PLACEMENT ZONE",
    weightKg: 6.0,
    failureReason: "OBJECT_NOT_DELIVERED",
    phaseLabels: {
      ...BASE_PHASE_LABELS,
      MOVING_TO_OBJECT: "Approaching Object",
      PICKING_OBJECT: "Positioning Bucket",
      OBJECT_PICKED: "Object Lifted",
      MOVING_TO_TARGET: "Carrying to Target",
      DROPPING_OBJECT: "Placing Object",
    },
  },
  LOAD_AND_DUMP: {
    taskType: "LOAD_AND_DUMP",
    label: "Load & Dump",
    icon: "⛏️",
    objectNoun: "material",
    sourceZoneLabel: "MATERIAL PILE",
    targetZoneLabel: "DUMP ZONE",
    weightKg: 18.0,
    failureReason: "TARGET_NOT_REACHED",
    phaseLabels: {
      ...BASE_PHASE_LABELS,
      MOVING_TO_OBJECT: "Approaching Pile",
      PICKING_OBJECT: "Loading Material",
      OBJECT_PICKED: "Bucket Raised",
      MOVING_TO_TARGET: "Transporting to Dump Zone",
      DROPPING_OBJECT: "Dumping Material",
    },
  },
  DELIVERY: {
    taskType: "DELIVERY",
    label: "Delivery",
    icon: "🚚",
    objectNoun: "parcel",
    sourceZoneLabel: "PICKUP",
    targetZoneLabel: "DELIVERY ZONE",
    weightKg: 8.0,
    failureReason: "OBJECT_NOT_DELIVERED",
    phaseLabels: {
      ...BASE_PHASE_LABELS,
      MOVING_TO_OBJECT: "Moving to Pickup",
      PICKING_OBJECT: "Picking Package",
      OBJECT_PICKED: "Package Loaded",
      MOVING_TO_TARGET: "Transporting Package",
      DROPPING_OBJECT: "Unloading Package",
    },
  },
  PACKAGE_TRANSPORT: {
    taskType: "PACKAGE_TRANSPORT",
    label: "Package Transport",
    icon: "📦",
    objectNoun: "cargo",
    sourceZoneLabel: "WAREHOUSE A",
    targetZoneLabel: "WAREHOUSE B",
    weightKg: 10.0,
    failureReason: "OBJECT_NOT_DELIVERED",
    phaseLabels: {
      ...BASE_PHASE_LABELS,
      MOVING_TO_OBJECT: "Moving to Warehouse A",
      PICKING_OBJECT: "Securing Cargo",
      OBJECT_PICKED: "Cargo Secured",
      MOVING_TO_TARGET: "Transporting to Warehouse B",
      DROPPING_OBJECT: "Depositing Cargo",
    },
  },
  COLOR_SORTING: {
    taskType: "COLOR_SORTING",
    label: "Color Sorting",
    icon: "🎨",
    objectNoun: "sorted item",
    sourceZoneLabel: "CONVEYOR IN",
    targetZoneLabel: "SORTED BIN",
    weightKg: 2.5,
    failureReason: "INCORRECT_SORTING",
    phaseLabels: {
      ...BASE_PHASE_LABELS,
      MOVING_TO_OBJECT: "Scanning Item",
      PICKING_OBJECT: "Gripping Item",
      OBJECT_PICKED: "Classifying Color",
      MOVING_TO_TARGET: "Routing to Bin",
      DROPPING_OBJECT: "Releasing into Bin",
    },
  },
};

export function getTaskConfig(taskType: TaskType | null | undefined): TaskConfig {
  if (!taskType) return TASK_CONFIG.MOVE_OBJECT;
  return TASK_CONFIG[taskType] ?? TASK_CONFIG.MOVE_OBJECT;
}
