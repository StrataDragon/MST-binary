import { TypedDataDomain, verifyTypedData } from "ethers";
import { PROOF_TYPES } from "./signing";

export interface ProofForVerification {
  jobId: string;
  machineId: string;
  result: number;
  timestamp: bigint | number | string;
  nonce: bigint | number | string;
  evidenceHash: string;
}

export function isValidMachineProofSignature(
  domain: TypedDataDomain,
  proof: ProofForVerification,
  signature: string,
  expectedSigner: string
): boolean {
  try {
    return verifyTypedData(domain, PROOF_TYPES, proof, signature).toLowerCase() === expectedSigner.toLowerCase();
  } catch {
    return false;
  }
}