import type { RobotState } from "../integration/protocol";

/**
 * Ordered execution phases for a MOVE_OBJECT job.
 * IDLE and FAILED are not part of the forward sequence — IDLE is the resting
 * state before a job, FAILED is a terminal branch triggered explicitly.
 */
export const JOB_PHASES: RobotState[] = [
  "JOB_RECEIVED",
  "MOVING_TO_OBJECT",
  "PICKING_OBJECT",
  "OBJECT_PICKED",
  "MOVING_TO_TARGET",
  "DROPPING_OBJECT",
  "COMPLETED",
];

/** How long each phase holds, in milliseconds. Tuned for a demo-friendly pace. */
export const PHASE_DURATIONS_MS: Record<RobotState, number> = {
  IDLE: 0,
  JOB_RECEIVED: 700,
  MOVING_TO_OBJECT: 2200,
  PICKING_OBJECT: 1200,
  OBJECT_PICKED: 500,
  MOVING_TO_TARGET: 2200,
  DROPPING_OBJECT: 1200,
  COMPLETED: 0,
  FAILED: 0,
};

/** Phase at which a simulated failure is injected, if requested. */
const FAILURE_PHASE: RobotState = "MOVING_TO_TARGET";

/** Fallback reason if a caller doesn't supply a task-specific one. */
const DEFAULT_FAILURE_REASON = "TARGET_NOT_REACHED";

export type PhaseTickHandler = (state: RobotState, phaseProgress: number) => void;

export type RunJobOptions = {
  simulateFailure?: boolean;
  /** Task-specific reason reported in JOB_FAILED (e.g. "OBJECT_NOT_DELIVERED"). */
  failureReason?: string;
  onPhaseEnter: (state: RobotState) => void;
  /** Called ~60x/sec with progress (0..1) through the current phase, for animation. */
  onTick: PhaseTickHandler;
  onFailed: (reason: string) => void;
  onCompleted: () => void;
  /** Poll this each tick; if it returns true, execution stops immediately (cancel). */
  isCancelled: () => boolean;
};

/**
 * Drives the robot through the full job sequence with a real-time animation
 * loop (rAF-driven progress per phase), calling back into the caller so the
 * 3D scene and the WebSocket layer can react to every transition.
 */
export function runJob(options: RunJobOptions): { cancel: () => void } {
  let cancelled = false;
  let rafId = 0;

  const cancel = () => {
    cancelled = true;
    if (rafId) cancelAnimationFrame(rafId);
  };

  const playPhase = (index: number) => {
    if (cancelled || options.isCancelled()) return;

    const phase = JOB_PHASES[index];

    if (options.simulateFailure && phase === FAILURE_PHASE) {
      options.onPhaseEnter(phase);
      // Let the robot visibly start moving, then fail partway through.
      const failDelay = PHASE_DURATIONS_MS[phase] * 0.45;
      window.setTimeout(() => {
        if (cancelled || options.isCancelled()) return;
        options.onFailed(options.failureReason ?? DEFAULT_FAILURE_REASON);
      }, failDelay);
      return;
    }

    options.onPhaseEnter(phase);
    const duration = PHASE_DURATIONS_MS[phase];
    const startTime = performance.now();

    const tick = (now: number) => {
      if (cancelled || options.isCancelled()) return;
      const elapsed = now - startTime;
      const progress = duration === 0 ? 1 : Math.min(1, elapsed / duration);
      options.onTick(phase, progress);

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const nextIndex = index + 1;
      if (nextIndex >= JOB_PHASES.length) {
        options.onCompleted();
      } else {
        playPhase(nextIndex);
      }
    };

    rafId = requestAnimationFrame(tick);
  };

  playPhase(0);

  return { cancel };
}
