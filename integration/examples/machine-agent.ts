/**
 * MEMBER 3 reference — MACHINE side: accept -> start -> (robot runs) -> sign proof -> submit proof.
 *   JOB_ID=0x... MACHINE_PRIVATE_KEY=0x... npx ts-node integration/examples/machine-agent.ts [success|fail]
 * Evidence is written to integration/examples/out/ (stands in for your HTTP call to the verifier).
 */
import * as fs from "fs";
import * as path from "path";
import { Wallet } from "ethers";
import { cfg, provider, getEscrow } from "./config";
import {
  ProofResult, escrowDomain, hashEvidence, machineIdToBytes32, randomNonce, signProof,
} from "../signing";

async function main() {
  const jobId = process.env.JOB_ID!;
  const machineText = process.env.MACHINE_ID || "M-042";
  const mode = process.argv[2] || "success";
  const wallet = new Wallet(process.env.MACHINE_PRIVATE_KEY!, provider); // wallet + signer key (same key in the demo)
  const escrow = getEscrow(wallet);
  const machineId = machineIdToBytes32(machineText);

  // 1. accept + start (needs a little native token for gas in the machine wallet)
  await (await escrow.acceptJob(jobId, machineId)).wait();
  await (await escrow.startExecution(jobId)).wait();
  console.log("accepted + executing");

  // 2. ... Member 2's robot simulation runs and reports its final position ...
  const target = { zone: "green", x: 9, y: 4 };
  const evidence = {
    jobId, machineId: machineText, packageId: "A", target,
    finalPosition: mode === "success" ? { x: 9, y: 4 } : { x: 1, y: 1 },
    delivered: mode === "success",
  };

  // 3. sign the proof (EIP-712). Use CHAIN time so clock skew can never invalidate it.
  const latest = await provider.getBlock("latest");
  const proof = {
    jobId, machineId, result: ProofResult.SUCCESS,
    timestamp: latest!.timestamp, nonce: randomNonce(), evidenceHash: hashEvidence(evidence),
  };
  const signature = await signProof(wallet, escrowDomain(cfg.chainId, cfg.addresses.JobEscrow), proof);

  // 4. submit on-chain, and hand proof+signature+evidence to the verifier (HTTP in the real app)
  const rc = await (await escrow.submitProof(proof, signature)).wait();
  console.log("proof submitted in tx", rc!.hash);
  const out = path.join(__dirname, "out");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(
    path.join(out, `evidence-${jobId.slice(2, 10)}.json`),
    JSON.stringify({ proof: { ...proof, timestamp: proof.timestamp.toString(), nonce: proof.nonce.toString() }, signature, evidence }, null, 2)
  );
}
main().catch((e) => { console.error(e); process.exit(1); });
