import type { JobCompletedMessage, JobFailedMessage, StartJobMessage } from "../integration/protocol";
import { getTaskConfig } from "../state/taskConfig";

export function JobPanel({
  job,
  executionSeconds,
  result,
}: {
  job: StartJobMessage | null;
  executionSeconds: number;
  result: JobCompletedMessage | JobFailedMessage | null;
}) {
  return (
    <div className="panel job-panel">
      <div className="panel-title">JOB DETAILS</div>
      {!job ? (
        <div className="job-empty">No active job. The machine is idle and waiting for the backend to dispatch a START_JOB message.</div>
      ) : (
        <>
          <div className="job-row">
            <span className="k">Job ID</span>
            <span className="v">{job.jobId}</span>
          </div>
          <div className="job-row">
            <span className="k">Machine ID</span>
            <span className="v">{job.machineId}</span>
          </div>
          <div className="job-row">
            <span className="k">Task</span>
            <span className="v">
              {getTaskConfig(job.taskType).label} <span style={{ color: "var(--text-muted)" }}>({job.taskType})</span>
            </span>
          </div>
          <div className="job-row">
            <span className="k">Source</span>
            <span className="v">
              ({job.source.x}, {job.source.y})
            </span>
          </div>
          <div className="job-row">
            <span className="k">Target</span>
            <span className="v">
              ({job.target.x}, {job.target.y})
            </span>
          </div>
          <div className="job-row">
            <span className="k">Execution time</span>
            <span className="v">{executionSeconds.toFixed(1)}s</span>
          </div>
          <div className="job-row">
            <span className="k">Result</span>
            <span
              className="v"
              style={{
                color: !result ? "var(--text-muted)" : result.status === "SUCCESS" ? "var(--green)" : "var(--red)",
              }}
            >
              {!result ? "PENDING" : result.status}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
