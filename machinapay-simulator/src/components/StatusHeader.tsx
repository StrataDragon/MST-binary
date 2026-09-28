import type { ConnectionStatus } from "../hooks/useMachineConnection";
import type { RobotState, TaskType, ChainStage } from "../integration/protocol";
import { config } from "../config";
import { getTaskConfig } from "../state/taskConfig";

/** Task-aware banner copy — every task type reuses the same RobotState
 * values, but reads differently (e.g. "Approaching Pile" vs "Approaching
 * Object") via taskConfig's phaseLabels. */
function stateCopy(robotState: RobotState, taskType: TaskType | null): string {
  if (robotState === "IDLE") return "ONLINE — WAITING FOR JOB";
  const label = getTaskConfig(taskType ?? undefined).phaseLabels[robotState];
  return label.toUpperCase();
}

function connectionCopy(status: ConnectionStatus): { text: string; dot: "online" | "offline" | "pending" } {
  switch (status) {
    case "CONNECTED":
      return { text: "LIVE — linked to backend", dot: "online" };
    case "MOCK":
      return { text: "MOCK — offline", dot: "pending" };
    case "CONNECTING":
      return { text: "CONNECTING…", dot: "pending" };
    case "DISCONNECTED":
      return { text: "DISCONNECTED — offline", dot: "offline" };
  }
}

export function TopBar({
  connectionStatus,
  jobId,
  reward,
  taskType,
  chainStage,
  txHash,
}: {
  connectionStatus: ConnectionStatus;
  jobId: string | null;
  reward?: string;
  taskType?: TaskType | null;
  chainStage?: ChainStage | null;
  txHash?: string | null;
}) {
  const conn = connectionCopy(connectionStatus);

  return (
    <div className="top-bar">
      <div className="brand">
        <div className="brand-name">MACHINAPAY</div>
        <div className="brand-sub">REMOTE MACHINE SIMULATOR · LAPTOP 2</div>
      </div>

      <div className="top-metrics">
        <div className="metric-chip">
          <div className="metric-label">MACHINE</div>
          <div className="metric-value">{config.machineId}</div>
        </div>
        <div className="metric-chip">
          <div className="metric-label">CONNECTION</div>
          <div className="metric-value">
            <span className={`dot ${conn.dot}`} />
            {conn.text}
          </div>
        </div>
        <div className="metric-chip">
          <div className="metric-label">BLOCKCHAIN</div>
          <div
            className="metric-value"
            style={{
              color: chainStage ? "#00f2fe" : "var(--text-muted)",
              fontWeight: 500,
            }}
          >
            {chainStage ? (
              <span>
                {chainStage.replace("_", " ")}
                {txHash ? ` (${txHash.slice(0, 6)}…${txHash.slice(-4)})` : ""}
              </span>
            ) : (
              "NOT CONTROLLED HERE"
            )}
          </div>
        </div>

        <div className="metric-chip">
          <div className="metric-label">CURRENT JOB</div>
          <div className="metric-value">{jobId ?? "—"}</div>
        </div>
        {jobId && taskType && (
          <div className="metric-chip">
            <div className="metric-label">TASK TYPE</div>
            <div className="metric-value">
              {getTaskConfig(taskType).icon} {getTaskConfig(taskType).label}
            </div>
          </div>
        )}
        {jobId && (
          <div className="metric-chip">
            <div className="metric-label">REWARD ESCROWED</div>
            <div className="metric-value" style={{ color: "var(--amber)" }}>
              {reward ?? "1.0"} tMSTC
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function StateBanner({ robotState, taskType }: { robotState: RobotState; taskType: TaskType | null }) {
  const stateClass = robotState === "COMPLETED" ? "completed" : robotState === "FAILED" ? "failed" : "";
  return (
    <div className="state-banner">
      <div className={`state-text ${stateClass}`}>{stateCopy(robotState, taskType)}</div>
    </div>
  );
}
