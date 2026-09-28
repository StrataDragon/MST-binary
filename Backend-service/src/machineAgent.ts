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
import { recordAndEmitTx } from "./transactionStore";

export const MACHINE_ID_TEXT = process.env.MACHINE_ID || "M-042";

// Machine M-042 (Autonomous Transport Robot)
const machineWallet042 = new Wallet(requireEnv("MACHINE_PRIVATE_KEY"), provider);

// Machine M-051 (Robotic Pick-and-Place Arm)
const machine051Key =
  process.env.MACHINE_051_PRIVATE_KEY ||
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6";
const machineWallet051 = new Wallet(machine051Key, provider);

export function getMachineWallet(machineIdText?: string): Wallet {
  if (machineIdText === "M-051") {
    return machineWallet051;
  }
  return machineWallet042;
}

export function getMachineIdBytes(machineIdText?: string): string {
  return machineIdToBytes32(machineIdText || MACHINE_ID_TEXT);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name} (see .env.example)`);
  return v;
}

/** Evidence for Transport Robot (M-042) */
export interface TransportEvidenceInput {
  jobId: string;
  machineId: "M-042" | string;
  taskType: "PACKAGE_TRANSPORT";
  pickupLocation: string;
  destination: string;
  packageId?: string;
  packageWeightKg: number;
  distanceKm: number;
  completedAt: string;
  delivered: boolean;
}

/** Evidence for Color Sorting Arm (M-051) */
export interface ColorSortingEvidenceInput {
  jobId: string;
  machineId: "M-051" | string;
  taskType: "COLOR_SORTING";
  objectsProcessed: number;
  correctlySorted: number;
  incorrectlySorted: number;
  colorDistribution: {
    red: number;
    blue: number;
    green: number;
    yellow: number;
  };
  requiredAccuracy: number;
  actualAccuracy: number;
  completedAt: string;
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
export async function acceptAndStart(jobId: string, machineIdText: string = MACHINE_ID_TEXT) {
  const mWallet = getMachineWallet(machineIdText);
  const mBytes32 = getMachineIdBytes(machineIdText);
  const escrow = getEscrow(mWallet);
  const registry = getRegistry();

  const registered: boolean = await registry.isRegistered(mBytes32);
  if (!registered) {
    throw new Error(`machine ${machineIdText} is not registered in MachineRegistry`);
  }
  const active: boolean = await registry.isActive(mBytes32);
  if (!active) {
    throw new Error(`machine ${machineIdText} is registered but not active`);
  }

  const job = await escrow.getJob(jobId);
  if (Number(job.state) !== 1) {
    throw new Error(`job ${jobId} is not FUNDED (state=${job.state}); can't accept`);
  }

  const rcAccept = await (await escrow.acceptJob(jobId, mBytes32)).wait();
  upsertJob(jobId, {
    machineId: machineIdText,
    stage: "accepted",
    txs: { accept: rcAccept!.hash },
  });
  recordAndEmitTx({
    id: `tx-accept-${Date.now()}`,
    txHash: rcAccept!.hash,
    from: mWallet.address,
    to: cfg.addresses.JobEscrow,
    amount: "0.00 ETH",
    type: "escrow-accept",
    status: "confirmed",
    gasUsed: `${rcAccept?.gasUsed.toString()} gas`,
    blockNumber: rcAccept?.blockNumber,
    timestamp: "Just now",
    timeMillis: Date.now(),
    jobId,
    nodeType: "normal",
  });

  const rcStart = await (await escrow.startExecution(jobId)).wait();
  upsertJob(jobId, { stage: "executing", txs: { start: rcStart!.hash } });
  recordAndEmitTx({
    id: `tx-start-${Date.now()}`,
    txHash: rcStart!.hash,
    from: mWallet.address,
    to: cfg.addresses.JobEscrow,
    amount: "0.00 ETH",
    type: "escrow-start",
    status: "confirmed",
    gasUsed: `${rcStart?.gasUsed.toString()} gas`,
    blockNumber: rcStart?.blockNumber,
    timestamp: "Just now",
    timeMillis: Date.now(),
    jobId,
    nodeType: "normal",
  });

  return { acceptTx: rcAccept!.hash, startTx: rcStart!.hash };
}

/**
 * Step 2: robot finished (or failed). Build evidence, hash it, sign an EIP-712
 * proof with the machine's registered signer key, and submit it on-chain.
 */
export async function submitEvidenceAndProof(
  jobId: string,
  robot: RobotEvidenceInput,
  result: "success" | "fail" = "success",
  machineIdText: string = MACHINE_ID_TEXT
): Promise<ProofSubmission> {
  const mWallet = getMachineWallet(machineIdText);
  const mBytes32 = getMachineIdBytes(machineIdText);
  const escrow = getEscrow(mWallet);

  const evidence = {
    jobId,
    machineId: machineIdText,
    packageId: robot.packageId,
    target: robot.target,
    finalPosition: robot.finalPosition,
    delivered: robot.delivered,
  };

  const latest = await provider.getBlock("latest");
  const proof = {
    jobId,
    machineId: mBytes32,
    result: result === "success" ? ProofResult.SUCCESS : ProofResult.FAILED,
    timestamp: latest!.timestamp,
    nonce: randomNonce(),
    evidenceHash: hashEvidence(evidence),
  };

  const signature = await signProof(
    mWallet,
    escrowDomain(cfg.chainId, cfg.addresses.JobEscrow),
    proof
  );

  const rc = await (await escrow.submitProof(proof, signature)).wait();
  upsertJob(jobId, { stage: "proof_submitted", evidence, txs: { submitProof: rc!.hash } });
  recordAndEmitTx({
    id: `tx-proof-${Date.now()}`,
    txHash: rc!.hash,
    from: mWallet.address,
    to: cfg.addresses.JobEscrow,
    amount: "0.00 ETH",
    type: "proof-submit",
    status: "confirmed",
    gasUsed: `${rc?.gasUsed.toString()} gas`,
    blockNumber: rc?.blockNumber,
    timestamp: "Just now",
    timeMillis: Date.now(),
    jobId,
    nodeType: result === "success" ? "normal" : "suspicious",
  });

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

/**
 * Universal evidence & proof submitter for any machine type (Transport M-042 or Color Sorting M-051).
 */
export async function submitGenericEvidenceAndProof(
  jobId: string,
  evidence: any,
  result: "success" | "fail" = "success",
  machineIdText?: string
) {
  const chosenMachine = machineIdText || evidence.machineId || MACHINE_ID_TEXT;
  const mWallet = getMachineWallet(chosenMachine);
  const mBytes32 = getMachineIdBytes(chosenMachine);
  const escrow = getEscrow(mWallet);

  const latest = await provider.getBlock("latest");
  const evidenceHash = hashEvidence(evidence);

  const proof = {
    jobId,
    machineId: mBytes32,
    result: result === "success" ? ProofResult.SUCCESS : ProofResult.FAILED,
    timestamp: latest!.timestamp,
    nonce: randomNonce(),
    evidenceHash,
  };

  const signature = await signProof(
    mWallet,
    escrowDomain(cfg.chainId, cfg.addresses.JobEscrow),
    proof
  );

  const rc = await (await escrow.submitProof(proof, signature)).wait();
  upsertJob(jobId, { stage: "proof_submitted", evidence, txs: { submitProof: rc!.hash } });
  recordAndEmitTx({
    id: `tx-proof-${Date.now()}`,
    txHash: rc!.hash,
    from: mWallet.address,
    to: cfg.addresses.JobEscrow,
    amount: "0.00 ETH",
    type: "proof-submit",
    status: "confirmed",
    gasUsed: `${rc?.gasUsed.toString()} gas`,
    blockNumber: rc?.blockNumber,
    timestamp: "Just now",
    timeMillis: Date.now(),
    jobId,
    nodeType: result === "success" ? "normal" : "suspicious",
  });

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

export async function acceptJobOnly(jobId: string, machineText: string = MACHINE_ID_TEXT) {
  const mWallet = getMachineWallet(machineText);
  const escrow = getEscrow(mWallet);
  const targetId = machineIdToBytes32(machineText);
  const rcAccept = await (await escrow.acceptJob(jobId, targetId)).wait();
  upsertJob(jobId, {
    machineId: machineText,
    stage: "accepted",
    txs: { accept: rcAccept!.hash },
  });
  recordAndEmitTx({
    id: `tx-accept-${Date.now()}`,
    txHash: rcAccept!.hash,
    from: mWallet.address,
    to: cfg.addresses.JobEscrow,
    amount: "0.00 ETH",
    type: "escrow-accept",
    status: "confirmed",
    gasUsed: `${rcAccept?.gasUsed.toString()} gas`,
    blockNumber: rcAccept?.blockNumber,
    timestamp: "Just now",
    timeMillis: Date.now(),
    jobId,
    nodeType: "normal",
  });
  return rcAccept!.hash;
}

export async function startExecutionOnly(jobId: string, machineText: string = MACHINE_ID_TEXT) {
  const mWallet = getMachineWallet(machineText);
  const escrow = getEscrow(mWallet);
  const rcStart = await (await escrow.startExecution(jobId)).wait();
  upsertJob(jobId, { stage: "executing", txs: { start: rcStart!.hash } });
  recordAndEmitTx({
    id: `tx-start-${Date.now()}`,
    txHash: rcStart!.hash,
    from: mWallet.address,
    to: cfg.addresses.JobEscrow,
    amount: "0.00 ETH",
    type: "escrow-start",
    status: "confirmed",
    gasUsed: `${rcStart?.gasUsed.toString()} gas`,
    blockNumber: rcStart?.blockNumber,
    timestamp: "Just now",
    timeMillis: Date.now(),
    jobId,
    nodeType: "normal",
  });
  return rcStart!.hash;
}

export async function submitSimulatorEvidenceAndProof(
  jobId: string,
  evidence: {
    jobId: string;
    machineId: string;
    taskType: string;
    sourcePosition: { x: number; y: number };
    targetPosition: { x: number; y: number };
    finalPosition: { x: number; y: number };
    objectDelivered: boolean;
    completedAt: string;
    simulateFailure?: boolean;
  },
  result: "success" | "fail" = "success"
) {
  return submitGenericEvidenceAndProof(jobId, evidence, result, evidence.machineId || MACHINE_ID_TEXT);
}

export function getMachineAddress(machineIdText: string = MACHINE_ID_TEXT): string {
  return getMachineWallet(machineIdText).address;
}

