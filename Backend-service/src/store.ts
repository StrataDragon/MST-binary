/**
 * Simple in-memory job tracker so Member 4's dashboard has one place to poll
 * ("what stage is this job at, which txs, did it pass verification") instead
 * of re-deriving everything from raw chain calls. The chain itself (via
 * escrow.getJob / getJobState) always remains the source of truth — this is
 * a convenience cache, not authoritative state. It resets if this process
 * restarts; that's fine for a demo, and swappable for Redis/a DB later.
 */
export type Stage =
  | "idle"
  | "accepted"
  | "executing"
  | "proof_submitted"
  | "verifying"
  | "verified"
  | "paid"
  | "refunded"
  | "error";

export interface JobStatus {
  jobId: string;
  machineId: string;
  stage: Stage;
  txs: Record<string, string>;
  evidence?: unknown;
  checks?: Record<string, boolean>;
  passed?: boolean;
  error?: string;
  updatedAt: number;
}

const jobs = new Map<string, JobStatus>();

export function getJob(jobId: string): JobStatus | undefined {
  return jobs.get(jobId);
}

export function upsertJob(jobId: string | undefined, patch: Partial<JobStatus>): JobStatus | undefined {
  if (!jobId) return undefined;
  const prev: JobStatus = jobs.get(jobId) ?? {
    jobId,
    machineId: "",
    stage: "idle",
    txs: {},
    updatedAt: Date.now(),
  };
  const next: JobStatus = {
    ...prev,
    ...patch,
    txs: { ...prev.txs, ...(patch.txs ?? {}) },
    updatedAt: Date.now(),
  };
  jobs.set(jobId, next);
  return next;
}

export function listJobs(): JobStatus[] {
  return Array.from(jobs.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}
