import { useEffect, useState } from "react";
import { formatEther } from "ethers";
import { getReadProvider, getEscrow } from "../lib/wallet";
import { JOB_STATE_NAMES } from "../lib/config";

export interface JobSummary {
  jobId: string;
  state: number;
  verdict: number;
  reward: string;
  customer: string;
}

export function statusLabel(state: number, verdict: number): { text: string; tone: "dim" | "signal" | "ok" | "bad" } {
  if (state === 4 && verdict === 2) return { text: "Rejected by verifier", tone: "bad" };
  if (state === 6) return { text: "Paid", tone: "ok" };
  if (state === 7) return { text: "Refunded", tone: "bad" };
  if (state === 5) return { text: "Verified — releasing", tone: "signal" };
  if (state === 4) return { text: "Proof submitted — verifying", tone: "signal" };
  if (state === 3) return { text: "Executing", tone: "signal" };
  if (state === 2) return { text: "Accepted", tone: "signal" };
  if (state === 1) return { text: "Funded — awaiting machine", tone: "dim" };
  return { text: JOB_STATE_NAMES[state] ?? "Unknown", tone: "dim" };
}

const toneClass = { dim: "text-dim", signal: "text-signal", ok: "text-ok", bad: "text-bad" };

export function JobList({ selected, onSelect }: { selected: string | null; onSelect: (jobId: string) => void }) {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const provider = getReadProvider();
      const escrow = getEscrow(provider);
      const total = Number(await escrow.jobCount());
      const offset = Math.max(0, total - 25);
      const ids: string[] = await escrow.getJobIds(offset, total - offset);
      const jobs = await Promise.all(
        ids
          .slice()
          .reverse()
          .map(async (jobId) => {
            const j = await escrow.getJob(jobId);
            return {
              jobId,
              state: Number(j.state),
              verdict: Number(j.verdict),
              reward: formatEther(j.reward),
              customer: j.customer,
            };
          })
      );
      setJobs(jobs);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Could not load jobs");
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-dim">Jobs ({jobs.length})</h2>
      {error && <p className="text-sm text-bad">{error}</p>}
      <ul className="divide-y divide-line/60">
        {jobs.map((j) => {
          const status = statusLabel(j.state, j.verdict);
          return (
            <li key={j.jobId}>
              <button
                onClick={() => onSelect(j.jobId)}
                className={`flex w-full items-center justify-between py-2 text-left text-sm hover:text-white ${
                  selected === j.jobId ? "text-white" : "text-dim"
                }`}
              >
                <span className="font-mono">{j.jobId.slice(0, 10)}…</span>
                <span className="font-mono">{j.reward}</span>
                <span className={`font-medium ${toneClass[status.tone]}`}>{status.text}</span>
              </button>
            </li>
          );
        })}
        {jobs.length === 0 && !error && <li className="py-4 text-sm text-dim">No jobs yet — post one above.</li>}
      </ul>
    </div>
  );
}
