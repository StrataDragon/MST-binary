import { useEffect, useRef, useState } from "react";
import type { RobotState, TaskType } from "../integration/protocol";
import { TASK_CONFIG } from "../state/taskConfig";

const TASK_TYPES = Object.keys(TASK_CONFIG) as TaskType[];

export function MockControls({
  onSendJob,
  robotState,
}: {
  onSendJob: (taskType: TaskType, simulateFailure?: boolean) => void;
  robotState: RobotState;
}) {
  const [taskType, setTaskType] = useState<TaskType>("MOVE_OBJECT");
  const [sequenceIndex, setSequenceIndex] = useState<number | null>(null);
  const prevStateRef = useRef<RobotState>(robotState);

  const busy = robotState !== "IDLE" || sequenceIndex !== null;

  // Demonstrates the real dispatcher contract: the backend can push any
  // sequence of task types back to back, and Laptop 2 auto-executes and
  // resets to IDLE between them with zero manual button presses in between —
  // only the very first click here is a human action.
  useEffect(() => {
    const wasBusy = prevStateRef.current !== "IDLE";
    const isIdleNow = robotState === "IDLE";
    prevStateRef.current = robotState;

    if (sequenceIndex === null) return;

    if (sequenceIndex >= TASK_TYPES.length) {
      setSequenceIndex(null);
      return;
    }

    if (wasBusy && isIdleNow) {
      onSendJob(TASK_TYPES[sequenceIndex]);
      setSequenceIndex((i) => (i === null ? null : i + 1));
    }
  }, [robotState, sequenceIndex, onSendJob]);

  const runSequence = () => {
    onSendJob(TASK_TYPES[0]);
    setSequenceIndex(1);
  };

  return (
    <div className="mock-panel">
      <span className="mock-label">MOCK MODE — TEST DISPATCH ONLY</span>

      <select
        className="mock-select"
        value={taskType}
        disabled={busy}
        onChange={(e) => setTaskType(e.target.value as TaskType)}
      >
        {TASK_TYPES.map((t) => (
          <option key={t} value={t}>
            {TASK_CONFIG[t].icon} {TASK_CONFIG[t].label}
          </option>
        ))}
      </select>

      <button className="mock-btn" disabled={busy} onClick={() => onSendJob(taskType, false)}>
        SEND TEST JOB
      </button>
      <button className="mock-btn fail" disabled={busy} onClick={() => onSendJob(taskType, true)}>
        SEND FAILING JOB
      </button>
      <button className="mock-btn" disabled={busy} onClick={runSequence}>
        RUN ALL 4 JOB TYPES
      </button>
    </div>
  );
}
