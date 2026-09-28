import type { Position, RobotState, StartJobMessage } from "../integration/protocol";
import { PHASE_DURATIONS_MS } from "./robotStateMachine";
import { getTaskConfig } from "./taskConfig";

export type TelemetrySnapshot = {
  position: Position | null;
  speedMps: number;
  loadKg: number;
};

function lerpPos(a: Position, b: Position, t: number): Position {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Every value here is derived from the same (state, phaseProgress, job)
 * triple that drives the 3D animation — nothing here is randomized or
 * fabricated. Position interpolates along the job's real source->target
 * line; speed is the job's real distance divided by the phase's real
 * duration; load reflects whether the bucket is actually carrying the
 * object at that point in the sequence.
 */
export function computeTelemetry(
  state: RobotState,
  phaseProgress: number,
  job: StartJobMessage | null
): TelemetrySnapshot {
  if (!job) return { position: null, speedMps: 0, loadKg: 0 };

  const { source, target } = job;
  const carriedWeightKg = getTaskConfig(job.taskType).weightKg;
  const distance = Math.hypot(target.x - source.x, target.y - source.y);
  const cruiseSpeed = distance / (PHASE_DURATIONS_MS.MOVING_TO_TARGET / 1000 || 1);

  let position: Position = source;
  let speedMps = 0;
  let loadKg = 0;

  switch (state) {
    case "JOB_RECEIVED":
      position = source;
      break;
    case "MOVING_TO_OBJECT":
      position = source;
      speedMps = cruiseSpeed;
      break;
    case "PICKING_OBJECT":
      position = source;
      loadKg = phaseProgress >= 0.5 ? carriedWeightKg : 0;
      break;
    case "OBJECT_PICKED":
      position = source;
      loadKg = carriedWeightKg;
      break;
    case "MOVING_TO_TARGET":
      position = lerpPos(source, target, phaseProgress);
      speedMps = cruiseSpeed;
      loadKg = carriedWeightKg;
      break;
    case "DROPPING_OBJECT":
      position = target;
      loadKg = phaseProgress < 0.55 ? carriedWeightKg : 0;
      break;
    case "COMPLETED":
      position = target;
      break;
    case "FAILED":
      position = lerpPos(source, target, phaseProgress);
      loadKg = carriedWeightKg;
      break;
    default:
      position = source;
  }

  return { position, speedMps: Number(speedMps.toFixed(2)), loadKg };
}
