import { useState } from "react";
import { keccak256, parseEther, toUtf8Bytes } from "ethers";
import { getEscrow, decodeContractError } from "../lib/wallet";
import { DEFAULT_JOB_CONFIG } from "../lib/config";

export function CreateJobForm({ signer, onCreated }: { signer: any; onCreated: (jobId: string) => void }) {
  const [description, setDescription] = useState(DEFAULT_JOB_CONFIG.description);
  const [reward, setReward] = useState(DEFAULT_JOB_CONFIG.reward);
  const [minutes, setMinutes] = useState(DEFAULT_JOB_CONFIG.minutes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!signer) return setError("Connect your wallet first.");
    setBusy(true);
    setError(null);
    const escrow = getEscrow(signer);
    try {
      const jobId = keccak256(toUtf8Bytes(crypto.randomUUID()));
      const metadataHash = keccak256(toUtf8Bytes(description));
      const durationSeconds = Math.max(1, Math.round(Number(minutes) * 60));
      const tx = await escrow.createJob(jobId, metadataHash, durationSeconds, description, {
        value: parseEther(reward || "0"),
      });
      await tx.wait();
      onCreated(jobId);
    } catch (err: any) {
      setError(decodeContractError(err, escrow));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-line bg-panel p-4 space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-dim">Post a job</h2>
      <label className="block text-sm">
        <span className="text-dim">Description</span>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 w-full rounded border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-signal"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-dim">Reward</span>
          <input
            value={reward}
            onChange={(e) => setReward(e.target.value)}
            className="mt-1 w-full rounded border border-line bg-ink px-3 py-2 text-sm font-mono outline-none focus:border-signal"
          />
        </label>
        <label className="block text-sm">
          <span className="text-dim">Deadline (minutes)</span>
          <input
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="mt-1 w-full rounded border border-line bg-ink px-3 py-2 text-sm font-mono outline-none focus:border-signal"
          />
        </label>
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
      <button
        type="submit"
        disabled={busy || !signer}
        className="w-full rounded bg-signal py-2 text-sm font-semibold text-ink hover:brightness-110 disabled:opacity-50"
      >
        {busy ? "Locking funds…" : `Lock ${reward || "0"} & post job`}
      </button>
    </form>
  );
}
