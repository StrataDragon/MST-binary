/**
 * MEMBER 4 reference: everything the dashboard reads from chain (no wallet needed for reads).
 *   npx ts-node integration/examples/frontend-read.ts
 * Same calls work in the browser with `new BrowserProvider(window.ethereum)` instead of JsonRpcProvider.
 */
import { formatEther } from "ethers";
import { cfg, provider, getRegistry, getEscrow } from "./config";
import { JOB_STATE_NAMES, machineIdToBytes32, machineIdToString, machineIdToString as idText } from "../signing";

async function main() {
  const registry = getRegistry();
  const escrow = getEscrow();

  // ---- machine panel: "Is M-042 registered? What wallet? Reputation?"
  const M042 = machineIdToBytes32("M-042");
  console.log("registered:", await registry.isRegistered(M042), "| active:", await registry.isActive(M042));
  const m = await registry.getMachine(M042); // reverts MachineNotFound if unknown -> check isRegistered first
  console.log("wallet:", m.wallet, "| signer:", m.signer);
  console.log("stake:", formatEther(m.stake), "| reputation:", m.reputation.toString(), "| done/failed:", m.jobsCompleted.toString(), m.jobsFailed.toString());
  console.log("wallet balance:", formatEther(await provider.getBalance(m.wallet)), cfg.nativeToken);
  for (const id of await registry.getMachineIds()) console.log("machine in registry:", machineIdToString(id));

  // ---- marketplace: list jobs
  const total = Number(await escrow.jobCount());
  const ids: string[] = await escrow.getJobIds(0, 50);
  console.log(`\n${total} jobs; escrow holds ${formatEther(await escrow.totalLocked())} ${cfg.nativeToken}`);
  for (const id of ids.slice(-5)) {
    const j = await escrow.getJob(id);
    console.log(id.slice(0, 10), JOB_STATE_NAMES[Number(j.state)], formatEther(j.reward), "verdict", Number(j.verdict),
      j.machineId === "0x" + "00".repeat(32) ? "(no machine)" : idText(j.machineId));
  }

  // ---- live event feed: history + subscription
  const latest = await provider.getBlockNumber();
  const logs = await escrow.queryFilter("*", Math.max(0, latest - 5000), latest);
  console.log(`\nlast ${logs.length} escrow events:`);
  for (const l of logs.slice(-8)) {
    const name = "fragment" in l ? (l as any).fragment.name : "?";
    console.log(`  block ${l.blockNumber} ${name} tx ${l.transactionHash.slice(0, 12)}…`);
  }
  // one job's timeline, filtered by indexed jobId:
  if (ids.length) {
    const timeline = await escrow.queryFilter("*", 0, "latest");
    console.log("events for that job:", timeline.filter((l: any) => l.topics[1] === ids[ids.length - 1]).map((l: any) => l.fragment?.name).join(" -> "));
  }
  // subscribe (keep the process alive in a real UI):
  escrow.on("PaymentReleased", (jobId, machineId, wallet, amount) =>
    console.log("LIVE PaymentReleased", jobId, idText(machineId), wallet, formatEther(amount)));
  await new Promise((r) => setTimeout(r, 500));
  await escrow.removeAllListeners();
}
main().catch((e) => { console.error(e); process.exit(1); });
