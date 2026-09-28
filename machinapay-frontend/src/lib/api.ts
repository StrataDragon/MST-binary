/**
 * Calls to Member 3's machine-agent + verifier service.
 * Matches Backend-service/README.md exactly -- see that file if a route 400s.
 */
import { MEMBER3_API_URL } from "./config";

async function req(path: string, init?: RequestInit) {
  const res = await fetch(`${MEMBER3_API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `${path} failed (${res.status})`);
  return body;
}

export const machineApi = {
  health: () => req("/health"),
  listJobs: () => req("/jobs"),
  getJob: (jobId: string) => req(`/jobs/${jobId}`),

  /** Machine agent accepts a FUNDED job and starts execution. */
  acceptJob: (jobId: string) => req(`/machine/jobs/${jobId}/accept`, { method: "POST" }),

  /** Robot sim reports completion; backend signs+submits proof, then verifies + settles. */
  submitEvidence: (
    jobId: string,
    body: {
      packageId: string;
      target: { zone: string; x: number; y: number };
      finalPosition: { x: number; y: number };
      delivered: boolean;
      result?: "success" | "fail";
    }
  ) => req(`/machine/jobs/${jobId}/evidence`, { method: "POST", body: JSON.stringify(body) }),
};
