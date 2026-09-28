/**
 * Verifier side: read authoritative state from chain, run deterministic
 * (rule-based, no external AI) checks against the machine's evidence, sign an
 * attestation, submit it, then settle (release or refund). Mirrors Member 1's
 * tested reference in integration/examples/verifier.ts.
 *
 * Important: this service cannot move funds by its own will. JobEscrow only
 * accepts a validly *signed* verdict from the configured verifier address, and
 * release()/refund() always pay the parties fixed on-chain at job
 * creation/acceptance — anyone can call them, this service has no special
 * power over where the money goes, it only decides pass/fail.
 */
import { Wallet } from "ethers";
import { cfg, provider, getEscrow, getRegistry } from "./config";
import { isValidMachineProofSignature } from "./proofVerification";
import { escrowDomain, hashEvidence, machineIdToString, signAttestation } from "./signing";
import { upsertJob } from "./store";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name} (see .env.example)`);
  return v;
}

const verifierWallet = new Wallet(requireEnv("VERIFIER_PRIVATE_KEY"), provider);

export interface VerifyRequest {
  jobId: string;
  proof: {
    jobId: string;
    machineId: string;
    result: number;
    timestamp: string | number;
    nonce: string | number;
    evidenceHash: string;
  };
  signature: string;
  evidence: {
    jobId: string;
    machineId: string;
    packageId: string;
    target: { zone: string; x: number; y: number };
    finalPosition: { x: number; y: number };
    delivered: boolean;
  };
}

export interface VerifyResult {
  passed: boolean;
  checks: Record<string, boolean>;
  attestationTx: string;
  settleTx: string;
}

export async function verifyAndSettle(req: VerifyRequest): Promise<VerifyResult> {
  if (verifierWallet.address.toLowerCase() !== cfg.verifier.toLowerCase()) {
    throw new Error(
      `VERIFIER_PRIVATE_KEY resolves to ${verifierWallet.address}, but JobEscrow expects ${cfg.verifier}`
    );
  }

  const escrow = getEscrow(verifierWallet);
  const registry = getRegistry();

  // 1. Read authoritative on-chain state — never trust the request body alone.
  const job = await escrow.getJob(req.jobId);
  if (Number(job.state) !== 4) {
    throw new Error(`job ${req.jobId} is not PROOF_SUBMITTED (state=${job.state})`);
  }
  const machine = await registry.getMachine(job.machineId);

  const requestProofHash: string = await escrow.hashProof(req.proof);
  if (requestProofHash.toLowerCase() !== job.proofHash.toLowerCase()) {
    throw new Error(`proof payload does not match the proof submitted on-chain for job ${req.jobId}`);
  }
  const proofSignatureValid = isValidMachineProofSignature(
    escrowDomain(cfg.chainId, cfg.addresses.JobEscrow),
    req.proof,
    req.signature,
    machine.signer
  );
  if (!proofSignatureValid) {
    throw new Error(`invalid machine proof signature; expected registered signer ${machine.signer}`);
  }

  // 2. Deterministic, rule-based checks (no external AI call).
  const checks = {
    proofSignatureValid,
    machineActive: Boolean(machine.active),
    evidenceMatchesChainHash: hashEvidence(req.evidence) === job.evidenceHash,
    rightJob: req.evidence.jobId === req.jobId,
    rightMachine: req.evidence.machineId === machineIdToString(job.machineId),
    atTarget:
      req.evidence.finalPosition?.x === req.evidence.target?.x &&
      req.evidence.finalPosition?.y === req.evidence.target?.y,
    delivered: req.evidence.delivered === true,
  };
  const passed = Object.values(checks).every(Boolean);

  upsertJob(req.jobId, { stage: "verifying", checks, passed });

  // 3. Sign + submit the attestation. proofHash MUST be the on-chain job.proofHash,
  // not something recomputed locally, or submitAttestation reverts.
  const latest = await provider.getBlock("latest");
  const att = {
    jobId: req.jobId,
    machineId: job.machineId,
    proofHash: job.proofHash,
    passed,
    timestamp: latest!.timestamp,
  };
  const sig = await signAttestation(verifierWallet, escrowDomain(cfg.chainId, cfg.addresses.JobEscrow), att);
  const rcAtt = await (await escrow.submitAttestation(att, sig)).wait();
  upsertJob(req.jobId, { stage: "verified", txs: { attestation: rcAtt!.hash } });

  // 4. Settle. PASS -> release() pays the machine wallet; FAIL -> refund() pays
  // the customer. Anyone may call either; the contract fixes the payee.
  const settleTx = passed ? await escrow.release(req.jobId) : await escrow.refund(req.jobId);
  const rcSettle = await settleTx.wait();
  upsertJob(req.jobId, { stage: passed ? "paid" : "refunded", txs: { settle: rcSettle!.hash } });

  return {
    passed,
    checks,
    attestationTx: rcAtt!.hash,
    settleTx: rcSettle!.hash,
  };
}

export function getVerifierAddress(): string {
  return verifierWallet.address;
}
