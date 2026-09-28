/**
 * MachinaPay signing + encoding helpers.
 *
 * This file is the SINGLE SOURCE OF TRUTH for how proofs and attestations are encoded and signed.
 * Member 3 (machine agent + verifier) can copy this file as-is into their backend (needs only `ethers` v6).
 */
import {
  Signer,
  TypedDataDomain,
  TypedDataField,
  encodeBytes32String,
  decodeBytes32String,
  keccak256,
  toUtf8Bytes,
  hexlify,
  randomBytes,
} from "ethers";

// ------------------------------------------------------------------ enums (mirror the Solidity enums)
export const JobState = {
  CREATED: 0,
  FUNDED: 1,
  ACCEPTED: 2,
  EXECUTING: 3,
  PROOF_SUBMITTED: 4,
  VERIFIED: 5,
  PAID: 6,
  REFUNDED: 7,
} as const;
export const JOB_STATE_NAMES = Object.keys(JobState) as (keyof typeof JobState)[];

export const Verdict = { NONE: 0, PASS: 1, FAIL: 2 } as const;
export const RefundReason = { CUSTOMER_CANCELLED: 0, EXPIRED: 1, VERIFICATION_FAILED: 2 } as const;
export const ProofResult = { FAILED: 0, SUCCESS: 1 } as const;

// ------------------------------------------------------------------ id helpers
/** "M-042" -> bytes32 (max 31 ASCII chars). Reversible with `machineIdToString`. */
export const machineIdToBytes32 = (id: string): string => encodeBytes32String(id);
export const machineIdToString = (b32: string): string => decodeBytes32String(b32);

/** Any human string (e.g. a UUID) -> bytes32 jobId. Use a NEW string for every job. */
export const jobIdFromString = (s: string): string => keccak256(toUtf8Bytes(s));
/** Random bytes32 jobId. */
export const randomJobId = (): string => hexlify(randomBytes(32));
/** metadataHash convention: keccak256(utf8(description)). */
export const metadataHashOf = (description: string): string => keccak256(toUtf8Bytes(description));

/** Deterministic JSON (keys sorted recursively) so every party hashes evidence identically. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const obj = value as Record<string, unknown>;
  return (
    "{" +
    Object.keys(obj)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k]))
      .join(",") +
    "}"
  );
}
/** evidenceHash = keccak256(canonicalJson(evidence)). Evidence itself stays OFF-chain. */
export const hashEvidence = (evidence: unknown): string => keccak256(toUtf8Bytes(canonicalJson(evidence)));

/** Fresh random uint256 nonce (never reuse a nonce for the same machine). */
export const randomNonce = (): bigint => BigInt(hexlify(randomBytes(32)));

// ------------------------------------------------------------------ EIP-712
export const EIP712_NAME = "MachinaPay JobEscrow";
export const EIP712_VERSION = "1";

export const PROOF_TYPES: Record<string, TypedDataField[]> = {
  Proof: [
    { name: "jobId", type: "bytes32" },
    { name: "machineId", type: "bytes32" },
    { name: "result", type: "uint8" },
    { name: "timestamp", type: "uint64" },
    { name: "nonce", type: "uint256" },
    { name: "evidenceHash", type: "bytes32" },
  ],
};

export const ATTESTATION_TYPES: Record<string, TypedDataField[]> = {
  Attestation: [
    { name: "jobId", type: "bytes32" },
    { name: "machineId", type: "bytes32" },
    { name: "proofHash", type: "bytes32" },
    { name: "passed", type: "bool" },
    { name: "timestamp", type: "uint64" },
  ],
};

export interface ProofPayload {
  jobId: string;
  machineId: string;
  result: number; // 1 = success, 0 = failed
  timestamp: bigint | number; // unix seconds
  nonce: bigint;
  evidenceHash: string;
}

export interface AttestationPayload {
  jobId: string;
  machineId: string;
  proofHash: string; // job.proofHash read from chain (== escrow.hashProof(proof))
  passed: boolean;
  timestamp: bigint | number;
}

/** EIP-712 domain. `verifyingContract` = JobEscrow address, `chainId` = MST testnet chain id. */
export function escrowDomain(chainId: bigint | number, escrowAddress: string): TypedDataDomain {
  return { name: EIP712_NAME, version: EIP712_VERSION, chainId, verifyingContract: escrowAddress };
}

/** Machine side: sign a proof with the machine's registered signer key. */
export function signProof(machineSigner: Signer, domain: TypedDataDomain, proof: ProofPayload): Promise<string> {
  return machineSigner.signTypedData(domain, PROOF_TYPES, proof);
}

/** Verifier side: sign an attestation with the verifier key (address configured in JobEscrow). */
export function signAttestation(
  verifierSigner: Signer,
  domain: TypedDataDomain,
  attestation: AttestationPayload
): Promise<string> {
  return verifierSigner.signTypedData(domain, ATTESTATION_TYPES, attestation);
}
