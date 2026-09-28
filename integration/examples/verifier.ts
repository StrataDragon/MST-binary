/**
 * MEMBER 3 reference — VERIFIER side: read proof from chain, check evidence, sign attestation, submit, then release.
 *   JOB_ID=0x... VERIFIER_PRIVATE_KEY=0x... npx ts-node integration/examples/verifier.ts
 * The verifier key MUST be the address the escrow was deployed with (cfg.verifier). It cannot move funds by itself:
 * the contract only accepts its signed verdict; release() always pays the machine wallet fixed at acceptance.
 */
import * as fs from "fs";
import * as path from "path";
import { Wallet } from "ethers";
import { cfg, provider, getEscrow, getRegistry } from "./config";
import { escrowDomain, hashEvidence, machineIdToString, signAttestation } from "../signing";

async function main() {
  const jobId = process.env.JOB_ID!;
  const verifier = new Wallet(process.env.VERIFIER_PRIVATE_KEY!, provider);
  if (verifier.address.toLowerCase() !== cfg.verifier.toLowerCase()) throw new Error("not the escrow's verifier key");
  const escrow = getEscrow(verifier);
  const registry = getRegistry();

  // 1. read authoritative on-chain state
  const job = await escrow.getJob(jobId);
  if (Number(job.state) !== 4) throw new Error(`job not in PROOF_SUBMITTED (state ${job.state})`);
  const machine = await registry.getMachine(job.machineId);
  console.log("machine", machineIdToString(job.machineId), "registered+active:", machine.active);

  // 2. get proof + evidence from the machine agent (file here, HTTP in the real app)
  const file = path.join(__dirname, "out", `evidence-${jobId.slice(2, 10)}.json`);
  const { evidence } = JSON.parse(fs.readFileSync(file, "utf8"));

  // 3. deterministic rules
  const checks = {
    machineActive: machine.active,
    evidenceMatchesChainHash: hashEvidence(evidence) === job.evidenceHash, // ties off-chain evidence to on-chain proof
    rightJob: evidence.jobId === jobId,
    rightMachine: evidence.machineId === machineIdToString(job.machineId),
    atTarget: evidence.finalPosition.x === evidence.target.x && evidence.finalPosition.y === evidence.target.y,
    delivered: evidence.delivered === true,
  };
  const passed = Object.values(checks).every(Boolean);
  console.log("checks", checks, "=>", passed ? "PASS" : "FAIL");

  // 4. sign + submit attestation (proofHash MUST be the on-chain job.proofHash)
  const latest = await provider.getBlock("latest");
  const att = { jobId, machineId: job.machineId, proofHash: job.proofHash, passed, timestamp: latest!.timestamp };
  const sig = await signAttestation(verifier, escrowDomain(cfg.chainId, cfg.addresses.JobEscrow), att);
  await (await escrow.submitAttestation(att, sig)).wait();

  // 5. settle. PASS -> release() pays the machine; FAIL -> refund() pays the customer. Anyone may call either.
  const tx = passed ? await escrow.release(jobId) : await escrow.refund(jobId);
  const rc = await tx.wait();
  console.log(passed ? "PAYMENT RELEASED" : "CUSTOMER REFUNDED", "tx", rc!.hash);
}
main().catch((e) => { console.error(e); process.exit(1); });
