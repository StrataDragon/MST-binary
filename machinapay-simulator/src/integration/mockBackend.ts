import type { IncomingMessage, OutgoingMessage, Position, TaskType } from "./protocol";

/**
 * A tiny in-memory stand-in for Member 3's backend, used only when
 * VITE_MOCK_MODE=true. It lets Member 2 build and demo the simulator before
 * the real WebSocket server exists. Swapping to the real backend is just
 * flipping the env var — no component code changes.
 */
export class MockBackend {
  private listeners = new Set<(msg: IncomingMessage) => void>();

  onMessage(handler: (msg: IncomingMessage) => void) {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  /** Simulates the backend receiving the simulator's outgoing messages. */
  receive(_msg: OutgoingMessage) {
    // In mock mode we just log; a real backend would persist/relay these.
    // eslint-disable-next-line no-console
    console.log("[mock-backend] received from simulator:", _msg);
  }

  /** Test helper: push a START_JOB (or any message) as if the backend sent it. */
  push(msg: IncomingMessage) {
    this.listeners.forEach((fn) => fn(msg));
  }
}

export const mockBackend = new MockBackend();

let jobCounter = 1;

/**
 * Realistic-looking source/target/reward per task type, purely so the mock
 * "SEND TEST JOB" buttons demo each task distinctly. A real backend supplies
 * all of this over the wire — the simulator never invents it in real mode.
 */
const SAMPLE_JOB_DATA: Record<TaskType, { source: Position; target: Position; reward: string }> = {
  MOVE_OBJECT: { source: { x: 100, y: 300 }, target: { x: 600, y: 300 }, reward: "100" },
  PICK_AND_PLACE: { source: { x: 150, y: 150 }, target: { x: 550, y: 450 }, reward: "120" },
  LOAD_AND_DUMP: { source: { x: 120, y: 400 }, target: { x: 620, y: 400 }, reward: "160" },
  DELIVERY: { source: { x: 80, y: 220 }, target: { x: 640, y: 220 }, reward: "140" },
};

export function buildSampleJob(taskType: TaskType = "MOVE_OBJECT", simulateFailure = false): IncomingMessage {
  const id = `JOB-${String(jobCounter++).padStart(3, "0")}`;
  const { source, target, reward } = SAMPLE_JOB_DATA[taskType];
  return {
    type: "START_JOB",
    jobId: id,
    machineId: "M-042",
    taskType,
    reward,
    source,
    target,
    simulateFailure,
  };
}
