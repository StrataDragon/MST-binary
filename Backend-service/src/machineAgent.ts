/**
 * Machine agent side of the flow: accept -> start -> (Member 2's robot runs) ->
 * sign proof -> submit proof on-chain. Mirrors Member 1's tested reference in
 * integration/examples/machine-agent.ts, wrapped as callable service functions
 * instead of a one-shot script.
 */
import { Wallet } from "ethers";
import { cfg, provider, getEscrow, getRegistry } from "./config";
import {
  ProofResult,
  escrowDomain,
  hashEvidence,
  machineIdToBytes32,
  randomNonce,
  signProof,
} from "./signing";
import { upsertJob } from "./store";

export const MACHINE_ID_TEXT = process.env.MACHINE_ID || "M-042";

// Wallet + signer key are the same key in this demo (registry allows them to differ
// in general — see MachineRegistry.sol — but the seed script registers one key for both).
const machineWallet = new Wallet(requireEnv("MACHINE_PRIVATE_KEY"), provider);
const machineIdBytes32 = machineIdToBytes32(MACHINE_ID_TEXT);

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name} (see .env.example)`);
  return v;
}

/** Raw shape Member 2's robot simulation reports when a job finishes. */
export interface RobotEvidenceInput {
  packageId: string;
  target: { zone: string; x: number; y: number };
  finalPosition: { x: number; y: number };
  delivered: boolean;
}

export interface ProofSubmission {
  proof: {
    jobId: string;
    machineId: string;
    result: number;
    timestamp: string;
    nonce: string;
    evidenceHash: string;
  };
  signature: string;
  evidence: RobotEvidenceInput & { jobId: string; machineId: string };
  submitProofTx: string;
}

/**
 * Step 1: accept the job and start execution.
 * Caller must be the machine's wallet/signer/owner (enforced by JobEscrow);
 * job must be in FUNDED (state 1) or this reverts InvalidState.
 */
export async function acceptAndStart(jobId: string) {
  const escrow = getEscrow(machineWallet);
  const registry = getRegistry();

  const registered: boolean = await registry.isRegistered(machineIdBytes32);
  if (!registered) {
    throw new Error(`machine ${MACHINE_ID_TEXT} is not registered in MachineRegistry`);
  }
  const active: boolean = await registry.isActive(machineIdBytes32);
  if (!active) {
    throw new Error(`machine ${MACHINE_ID_TEXT} is registered but not active`);
  }

  const job = await escrow.getJob(jobId);
  if (Number(job.state) !== 1) {
    throw new Error(`job ${jobId} is not FUNDED (state=${job.state}); can't accept`);
  }

  const rcAccept = await (await escrow.acceptJob(jobId, machineIdBytes32)).wait();
  upsertJob(jobId, {
    machineId: MACHINE_ID_TEXT,
    stage: "accepted",
    txs: { accept: rcAccept!.hash },
  });

  const rcStart = await (await escrow.startExecution(jobId)).wait();
  upsertJob(jobId, { stage: "executing", txs: { start: rcStart!.hash } });

  return { acceptTx: rcAccept!.hash, startTx: rcStart!.hash };
}

/**
 * Step 2: robot finished (or failed). Build evidence, hash it, sign an EIP-712
 * proof with the machine's registered signer key, and submit it on-chain.
 * `result` is the MACHINE'S OWN claim (SUCCESS/FAILED) — the verifier still runs
 * its independent checks against `evidence` afterwards; a machine can't force a
 * PASS just by claiming success (see AttestationContradictsProof in JobEscrow).
 */
export async function submitEvidenceAndProof(
  jobId: string,
  robot: RobotEvidenceInput,
  result: "success" | "fail" = "success"
): Promise<ProofSubmission> {
  const escrow = getEscrow(machineWallet);

  const evidence = {
    jobId,
    machineId: MACHINE_ID_TEXT,
    packageId: robot.packageId,
    target: robot.target,
    finalPosition: robot.finalPosition,
    delivered: robot.delivered,
  };

  // Use CHAIN time, not Date.now(), so clock skew between machines can never
  // invalidate the signature (JobEscrow enforces timestamp freshness).
  const latest = await provider.getBlock("latest");
  const proof = {
    jobId,
    machineId: machineIdBytes32,
    result: result === "success" ? ProofResult.SUCCESS : ProofResult.FAILED,
    timestamp: latest!.timestamp,
    nonce: randomNonce(),
    evidenceHash: hashEvidence(evidence),
  };

  const signature = await signProof(
    machineWallet,
    escrowDomain(cfg.chainId, cfg.addresses.JobEscrow),
    proof
  );

  const rc = await (await escrow.submitProof(proof, signature)).wait();
  upsertJob(jobId, { stage: "proof_submitted", evidence, txs: { submitProof: rc!.hash } });

  return {
    proof: {
      ...proof,
      timestamp: proof.timestamp.toString(),
      nonce: proof.nonce.toString(),
    },
    signature,
    evidence,
    submitProofTx: rc!.hash,
  };
}

export function getMachineAddress(): string {
  return machineWallet.address;
}
