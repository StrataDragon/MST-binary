import { computeTelemetry } from "../state/telemetry";
import type { RobotState, StartJobMessage } from "../integration/protocol";
import { getTaskConfig } from "../state/taskConfig";

function statusLabel(state: RobotState): string {
  switch (state) {
    case "IDLE":
      return "IDLE";
    case "COMPLETED":
      return "COMPLETE";
    case "FAILED":
      return "FAULT";
    default:
      return "WORKING";
  }
}

export function TelemetryPanel({
  robotState,
  phaseProgress,
  job,
  batteryPercent,
}: {
  robotState: RobotState;
  phaseProgress: number;
  job: StartJobMessage | null;
  batteryPercent: number;
}) {
  const { position, speedMps, loadKg } = computeTelemetry(robotState, phaseProgress, job);

  return (
    <div className="panel telemetry-panel">
      <div className="telemetry-grid">
        <div className="telemetry-cell">
          <div className="metric-label">STATUS</div>
          <div className="metric-value">{statusLabel(robotState)}</div>
        </div>
        <div className="telemetry-cell">
          <div className="metric-label">BATTERY</div>
          <div className="metric-value" style={{ color: batteryPercent < 25 ? "var(--red)" : "var(--text)" }}>
            {batteryPercent.toFixed(0)}%
          </div>
        </div>
        <div className="telemetry-cell">
          <div className="metric-label">POSITION</div>
          <div className="metric-value">{position ? `${position.x.toFixed(0)}, ${position.y.toFixed(0)}` : "—"}</div>
        </div>
        <div className="telemetry-cell">
          <div className="metric-label">SPEED</div>
          <div className="metric-value">{speedMps.toFixed(2)} u/s</div>
        </div>
        <div className="telemetry-cell">
          <div className="metric-label">LOAD</div>
          <div className="metric-value">{loadKg.toFixed(1)} kg</div>
        </div>
        <div className="telemetry-cell">
          <div className="metric-label">TASK</div>
          <div className="metric-value">{job ? getTaskConfig(job.taskType).label : "—"}</div>
        </div>
        <div className="telemetry-cell">
          <div className="metric-label">JOB ID</div>
          <div className="metric-value">{job?.jobId ?? "—"}</div>
        </div>
      </div>
    </div>
  );
}
