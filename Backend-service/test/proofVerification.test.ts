import assert from "node:assert/strict";
import { test } from "node:test";
import { Wallet } from "ethers";
import { isValidMachineProofSignature } from "../src/proofVerification";
import { escrowDomain, PROOF_TYPES } from "../src/signing";

const domain = escrowDomain(31337, "0x0000000000000000000000000000000000000001");
const proof = {
  jobId: `0x${"11".repeat(32)}`,
  machineId: `0x${"22".repeat(32)}`,
  result: 1,
  timestamp: "1700000000",
  nonce: "7",
  evidenceHash: `0x${"33".repeat(32)}`,
};

test("accepts a proof signed by the registered machine signer", async () => {
  const signer = Wallet.createRandom();
  const signature = await signer.signTypedData(domain, PROOF_TYPES, proof);

  assert.equal(isValidMachineProofSignature(domain, proof, signature, signer.address), true);
});

test("rejects a proof signed by a different wallet", async () => {
  const signer = Wallet.createRandom();
  const signature = await signer.signTypedData(domain, PROOF_TYPES, proof);

  assert.equal(isValidMachineProofSignature(domain, proof, signature, Wallet.createRandom().address), false);
});

test("rejects a signature when the proof payload has changed", async () => {
  const signer = Wallet.createRandom();
  const signature = await signer.signTypedData(domain, PROOF_TYPES, proof);

  assert.equal(
    isValidMachineProofSignature(domain, { ...proof, result: 0 }, signature, signer.address),
    false
  );
});

test("rejects malformed signatures", () => {
  assert.equal(isValidMachineProofSignature(domain, proof, "0x1234", Wallet.createRandom().address), false);
});