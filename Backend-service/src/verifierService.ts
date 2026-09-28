/**
 * Multi-Verifier Aggregator Service:
 * 3 independent simulated verifiers evaluate the machine proof & evidence:
 *   - Verifier Alpha: Cryptographic signature & proof hash integrity
 *   - Verifier Beta: Physical sensor telemetry & drop coordinates
 *   - Verifier Gamma: Protocol policy, machine activity & deadline compliance
 *
 * Quorum rule: >= 2/3 votes required for consensus PASS.
 * If quorum is achieved, the authorized on-chain verifier wallet signs
 * the single EIP-712 attestation and broadcasts it on-chain, followed by
 * settlement (release or refund).
 */
import { formatEther, Wallet } from "ethers";
import { cfg, provider, getEscrow, getRegistry } from "./config";
import { isValidMachineProofSignature } from "./proofVerification";
import { escrowDomain, hashEvidence, machineIdToString, signAttestation } from "./signing";
import { upsertJob } from "./store";
import { recordAndEmitTx } from "./transactionStore";

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
  evidence: any;
}


export interface VerifierVote {
  name: string;
  role: string;
  vote: "PASS" | "FAIL";
  passed: boolean;
  reason?: string;
  checks: Record<string, boolean>;
}

export interface VerifyResult {
  passed: boolean;
  checks: Record<string, boolean>;
  verifiers: VerifierVote[];
  consensus: {
    votesFor: number;
    votesAgainst: number;
    quorum: boolean;
    decision: "RELEASE" | "REFUND";
  };
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

  // 1. Read authoritative on-chain state
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

  const evidenceMatchesChainHash = hashEvidence(req.evidence) === job.evidenceHash;
  const machineActive = Boolean(machine.active);
  const rightJob = req.evidence.jobId === req.jobId;
  const rightMachine = req.evidence.machineId === machineIdToString(job.machineId);
  const machineReportedSuccess = req.proof.result === 1;
  const isColorSorting =
    req.evidence?.taskType === "COLOR_SORTING" || req.evidence?.objectsProcessed !== undefined;
  const isTransport =
    req.evidence?.taskType === "PACKAGE_TRANSPORT" || req.evidence?.pickupLocation !== undefined;

  let betaPassed = false;
  let betaReason = "";
  let betaChecks: Record<string, boolean> = {};
  let atTarget = true;
  let delivered = true;

  if (isColorSorting) {
    const objectsProcessed = Number(req.evidence.objectsProcessed) || 0;
    const requiredAccuracy = Number(req.evidence.requiredAccuracy) || 95;
    const actualAccuracy = Number(req.evidence.actualAccuracy) || 0;
    const accuracyMet = actualAccuracy >= requiredAccuracy;
    const countValid = objectsProcessed > 0;
    atTarget = accuracyMet;
    delivered = countValid;
    betaChecks = { accuracyMet, countValid, machineReportedSuccess };
    betaPassed = accuracyMet && countValid && machineReportedSuccess;
    betaReason = betaPassed
      ? `Color arm telemetry verified: ${req.evidence.correctlySorted || objectsProcessed}/${objectsProcessed} sorted (${actualAccuracy}% accuracy >= ${requiredAccuracy}% required)`
      : `Color arm verification failed: accuracy ${actualAccuracy}% is below required ${requiredAccuracy}%`;
  } else {
    const targetX = (req.evidence as any).targetPosition?.x ?? req.evidence.target?.x;
    const targetY = (req.evidence as any).targetPosition?.y ?? req.evidence.target?.y;
    atTarget =
      req.evidence.finalPosition?.x !== undefined
        ? req.evidence.finalPosition?.x === targetX && req.evidence.finalPosition?.y === targetY
        : true;
    delivered =
      (req.evidence as any).objectDelivered === true || req.evidence.delivered === true;
    betaChecks = { delivered, atTarget, machineReportedSuccess };
    betaPassed = delivered && atTarget && machineReportedSuccess;
    betaReason = betaPassed
      ? `Package delivered at destination (${req.evidence.destination || "Warehouse B"})`
      : "Delivery incomplete or coordinates mismatch";
  }

  // 2. Multi-verifier simulation voting
  // Verifier Alpha: Cryptography & Hashes
  const alphaChecks = { proofSignatureValid, evidenceMatchesChainHash };
  const alphaPassed = proofSignatureValid && evidenceMatchesChainHash;

  // Verifier Gamma: Compliance, Machine Identity & Authority
  const gammaChecks = { machineActive, rightJob, rightMachine };
  const gammaPassed = machineActive && rightJob && rightMachine;

  const verifiers: VerifierVote[] = [
    {
      name: "Verifier Alpha",
      role: "Cryptographic Attestation & EIP-712 Engine",
      vote: alphaPassed ? "PASS" : "FAIL",
      passed: alphaPassed,
      reason: alphaPassed
        ? "Signature valid against registered machine signer"
        : "Signature or evidence hash mismatch",
      checks: alphaChecks,
    },
    {
      name: "Verifier Beta",
      role: isColorSorting
        ? "Color Sensor & Accuracy Telemetry Engine"
        : "Autonomous Transport & Trajectory Telemetry",
      vote: betaPassed ? "PASS" : "FAIL",
      passed: betaPassed,
      reason: betaReason,
      checks: betaChecks,
    },
    {
      name: "Verifier Gamma",
      role: "Registry Policy & Active Collateral Compliance",
      vote: gammaPassed ? "PASS" : "FAIL",
      passed: gammaPassed,
      reason: gammaPassed
        ? `Machine ${machineIdToString(job.machineId)} active, stake confirmed, authorized operator`
        : "Machine inactive or unauthorized caller",
      checks: gammaChecks,
    },
  ];

  const votesFor = verifiers.filter((v) => v.passed).length;
  const votesAgainst = 3 - votesFor;
  const quorum = votesFor >= 2;
  // If machine reported failure, contract forbids attesting pass
  const passed = quorum && machineReportedSuccess;

  const consensus = {
    votesFor,
    votesAgainst,
    quorum,
    decision: (passed ? "RELEASE" : "REFUND") as "RELEASE" | "REFUND",
  };

  const allChecks = {
    proofSignatureValid,
    machineActive,
    evidenceMatchesChainHash,
    rightJob,
    rightMachine,
    atTarget,
    delivered,
    machineReportedSuccess,
    multiVerifierConsensus: quorum,
  };

  upsertJob(req.jobId, { stage: "verifying", checks: allChecks, passed });

  // 3. Sign and submit on-chain attestation
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

  recordAndEmitTx({
    id: `tx-attest-${Date.now()}`,
    txHash: rcAtt!.hash,
    from: verifierWallet.address,
    to: cfg.addresses.JobEscrow,
    amount: "0.00 ETH",
    type: "verifier-attest",
    status: passed ? "confirmed" : "failed",
    gasUsed: `${rcAtt?.gasUsed.toString()} gas`,
    blockNumber: rcAtt?.blockNumber,
    timestamp: "Just now",
    timeMillis: Date.now(),
    jobId: req.jobId,
    nodeType: passed ? "normal" : "mule",
  });

  // 4. Settle on-chain (release or refund)
  const settleTx = passed ? await escrow.release(req.jobId) : await escrow.refund(req.jobId);
  const rcSettle = await settleTx.wait();
  upsertJob(req.jobId, { stage: passed ? "paid" : "refunded", txs: { settle: rcSettle!.hash } });

  recordAndEmitTx({
    id: `tx-settle-${Date.now()}`,
    txHash: rcSettle!.hash,
    from: cfg.addresses.JobEscrow,
    to: passed ? job.machineWallet : job.customer,
    amount: `${formatEther(job.reward)} ${cfg.nativeToken}`,
    type: passed ? "escrow-release" : "escrow-refund",
    status: passed ? "confirmed" : "failed",
    gasUsed: `${rcSettle?.gasUsed.toString()} gas`,
    blockNumber: rcSettle?.blockNumber,
    timestamp: "Just now",
    timeMillis: Date.now(),
    jobId: req.jobId,
    nodeType: passed ? "normal" : "mule",
  });

  return {
    passed,
    checks: allChecks,
    verifiers,
    consensus,
    attestationTx: rcAtt!.hash,
    settleTx: rcSettle!.hash,
  };
}

export function getVerifierAddress(): string {
  return verifierWallet.address;
}
