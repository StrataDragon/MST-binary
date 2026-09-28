import type { Position } from "../integration/protocol";

export type WorldPoint = [number, number]; // [x, z] in Three.js world units

/**
 * Fixed on-screen travel distance, regardless of the job's own coordinate
 * scale (which could be pixels, meters, or anything Member 3's backend
 * happens to use). This keeps the camera framing valid for every job
 * without needing to reposition it per job, while the *direction* of travel
 * still genuinely reflects the job's source -> target vector.
 */
const TRAVEL_DISTANCE = 6.4;

/** Shown before any job has ever been received, so the console isn't blank. */
const DEFAULT_SOURCE: WorldPoint = [-3.2, 0];
const DEFAULT_TARGET: WorldPoint = [3.2, 0];

export function mapJobToWorld(
  source: Position | undefined,
  target: Position | undefined
): { sourceWorld: WorldPoint; targetWorld: WorldPoint } {
  if (!source || !target) {
    return { sourceWorld: DEFAULT_SOURCE, targetWorld: DEFAULT_TARGET };
  }

  const dx = target.x - source.x;
  const dz = target.y - source.y; // protocol's "y" is the second planar axis; rendered as world Z
  const dist = Math.hypot(dx, dz);
  const ux = dist > 0.0001 ? dx / dist : 1;
  const uz = dist > 0.0001 ? dz / dist : 0;
  const half = TRAVEL_DISTANCE / 2;

  return {
    sourceWorld: [-ux * half, -uz * half],
    targetWorld: [ux * half, uz * half],
  };
}
