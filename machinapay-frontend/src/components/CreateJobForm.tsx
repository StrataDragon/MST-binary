import { useState } from "react";
import { keccak256, parseEther, formatEther, toUtf8Bytes } from "ethers";
import { getEscrow, decodeContractError } from "../lib/wallet";
import { DEFAULT_JOB_CONFIG, MEMBER3_API_URL, NATIVE_SYMBOL } from "../lib/config";

export function CreateJobForm({ signer, onCreated }: { signer: any; onCreated: (jobId: string) => void }) {
  const [description, setDescription] = useState(DEFAULT_JOB_CONFIG.description);
  const [reward, setReward] = useState(DEFAULT_JOB_CONFIG.reward);
  const [minutes, setMinutes] = useState(DEFAULT_JOB_CONFIG.minutes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedReward, setSuggestedReward] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!signer) return setError("Connect your wallet first.");
    setBusy(true);
    setError(null);
    setSuggestedReward(null);
    const escrow = getEscrow(signer);
    try {
      const jobId = keccak256(toUtf8Bytes(crypto.randomUUID()));

      // Call backend to canonicalize & store off-chain metadata, returning keccak256 hash
      let metadataHash: string;
      try {
        const backendUrl = MEMBER3_API_URL;
        const metaRes = await fetch(`${backendUrl}/api/jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            taskType: "MOVE_OBJECT",
            source: { x: 100, y: 300 },
            target: { x: 600, y: 300 },
            description,
          }),
        });
        if (!metaRes.ok) {
          throw new Error(`Backend metadata registration failed with HTTP ${metaRes.status}`);
        }
        const metaJson = await metaRes.json();
        if (!metaJson.metadataHash) {
          throw new Error("Backend did not return a valid metadataHash");
        }
        metadataHash = metaJson.metadataHash;
      } catch (e: any) {
        throw new Error(`Cannot create job: Backend metadata service unreachable (${e.message}). Ensure Backend-service is running on port 4000.`);
      }

      const durationSeconds = Math.max(1, Math.round(Number(minutes) * 60));

      // Pre-flight balance & gas check before triggering wallet prompt
      const userAddr = await signer.getAddress();
      const userBalance: bigint = await signer.provider.getBalance(userAddr);
      const feeData = await signer.provider.getFeeData();
      const gasPrice = feeData.maxFeePerGas || feeData.gasPrice || 1000000000n;
      let estGas = 200000n;
      try {
        estGas = await escrow.createJob.estimateGas(jobId, metadataHash, durationSeconds, description, {
          value: parseEther(reward || "0"),
        });
      } catch {
        estGas = 250000n;
      }
      const estGasCost = (estGas * gasPrice * 12n) / 10n; // 20% safety margin
      const rewardWei = parseEther(reward || "0");
      const totalNeeded = rewardWei + estGasCost;

      if (userBalance < totalNeeded) {
        const maxSafeWei = userBalance > estGasCost ? userBalance - estGasCost : 0n;
        const maxSafe = formatEther(maxSafeWei);
        setSuggestedReward(maxSafe);
        throw new Error(
          `Need ${formatEther(totalNeeded)} ${NATIVE_SYMBOL} (reward ${reward} + gas ~${formatEther(estGasCost)}), but wallet has ${formatEther(userBalance)} ${NATIVE_SYMBOL}. Max safe reward is ${Number(maxSafe).toFixed(4)} ${NATIVE_SYMBOL}.`
        );
      }

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
      {suggestedReward && Number(suggestedReward) > 0 && (
        <button
          type="button"
          onClick={() => {
            setReward(Number(suggestedReward).toFixed(4));
            setError(null);
            setSuggestedReward(null);
          }}
          className="w-full text-xs py-1.5 px-3 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 font-mono transition-colors"
        >
          ⚡ Use max safe reward ({Number(suggestedReward).toFixed(4)} {NATIVE_SYMBOL})
        </button>
      )}
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
