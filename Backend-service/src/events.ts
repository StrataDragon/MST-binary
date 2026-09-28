/**
 * Listens for the escrow and registry on-chain events so the job store,
 * transaction store, and live stream stay in real-time sync with Hardhat node.
 */
import { formatEther } from "ethers";
import { getEscrow, getRegistry, cfg } from "./config";
import { machineIdToString } from "./signing";
import { upsertJob } from "./store";
import { recordAndEmitTx } from "./transactionStore";

export function startEventListeners() {
  const escrow = getEscrow();
  const registry = getRegistry();

  // 1. Escrow creation & funding
  escrow.on(
    "JobCreated",
    (jobId: string, customer: string, reward: bigint, metadataHash: string, deadline: bigint, description: string, event: any) => {
      const txHash = event?.log?.transactionHash || `0x${jobId.slice(2, 66)}`;
      const blockNumber = event?.log?.blockNumber;
      console.log(
        `[event] JobCreated job=${jobId.slice(0, 10)}… customer=${customer} reward=${formatEther(reward)} desc="${description}"`
      );
      upsertJob(jobId, { stage: "idle" });
      recordAndEmitTx({
        id: `evt-${jobId.slice(0, 8)}-created`,
        txHash,
        from: customer,
        to: cfg.addresses.JobEscrow,
        amount: `${formatEther(reward)} ${cfg.nativeToken}`,
        type: "escrow-deposit",
        status: "confirmed",
        blockNumber,
        timestamp: "Just now",
        timeMillis: Date.now(),
        jobId,
        nodeType: "contract",
      });
    }
  );

  // 2. Machine acceptance
  escrow.on("JobAccepted", (jobId: string, machineId: string, machineWallet: string, event: any) => {
    const txHash = event?.log?.transactionHash || `0x${jobId.slice(2, 66)}`;
    const blockNumber = event?.log?.blockNumber;
    console.log(`[event] JobAccepted job=${jobId.slice(0, 10)}… machine=${machineIdToString(machineId)} wallet=${machineWallet}`);
    upsertJob(jobId, { stage: "accepted", machineId: machineIdToString(machineId) });
    recordAndEmitTx({
      id: `evt-${jobId.slice(0, 8)}-accepted`,
      txHash,
      from: machineWallet,
      to: cfg.addresses.JobEscrow,
      amount: "0.00 ETH",
      type: "escrow-accept",
      status: "confirmed",
      blockNumber,
      timestamp: "Just now",
      timeMillis: Date.now(),
      jobId,
      nodeType: "normal",
    });
  });

  // 3. Execution started
  escrow.on("JobExecutionStarted", (jobId: string, machineId: string, event: any) => {
    const txHash = event?.log?.transactionHash || `0x${jobId.slice(2, 66)}`;
    const blockNumber = event?.log?.blockNumber;
    console.log(`[event] JobExecutionStarted job=${jobId.slice(0, 10)}… machine=${machineIdToString(machineId)}`);
    upsertJob(jobId, { stage: "executing" });
    recordAndEmitTx({
      id: `evt-${jobId.slice(0, 8)}-started`,
      txHash,
      from: cfg.addresses.JobEscrow,
      to: machineIdToString(machineId),
      amount: "0.00 ETH",
      type: "escrow-start",
      status: "confirmed",
      blockNumber,
      timestamp: "Just now",
      timeMillis: Date.now(),
      jobId,
      nodeType: "normal",
    });
  });

  // 4. Proof submitted
  escrow.on(
    "ProofSubmitted",
    (jobId: string, machineId: string, proofHash: string, evidenceHash: string, result: number, timestamp: bigint, nonce: bigint, event: any) => {
      const txHash = event?.log?.transactionHash || proofHash;
      const blockNumber = event?.log?.blockNumber;
      console.log(`[event] ProofSubmitted job=${jobId.slice(0, 10)}… result=${result === 1 ? "SUCCESS" : "FAILED"}`);
      upsertJob(jobId, { stage: "proof_submitted" });
      recordAndEmitTx({
        id: `evt-${jobId.slice(0, 8)}-proof`,
        txHash,
        from: machineIdToString(machineId),
        to: cfg.addresses.JobEscrow,
        amount: "0.00 ETH",
        type: "proof-submit",
        status: "confirmed",
        blockNumber,
        timestamp: "Just now",
        timeMillis: Date.now(),
        jobId,
        nodeType: result === 1 ? "normal" : "suspicious",
      });
    }
  );

  // 5. Verification submitted
  escrow.on("VerificationSubmitted", (jobId: string, machineId: string, verifier: string, passed: boolean, proofHash: string, event: any) => {
    const txHash = event?.log?.transactionHash || proofHash;
    const blockNumber = event?.log?.blockNumber;
    console.log(`[event] VerificationSubmitted job=${jobId.slice(0, 10)}… verifier=${verifier} passed=${passed}`);
    upsertJob(jobId, { stage: passed ? "verified" : "proof_submitted", passed });
    recordAndEmitTx({
      id: `evt-${jobId.slice(0, 8)}-attestation`,
      txHash,
      from: verifier,
      to: cfg.addresses.JobEscrow,
      amount: "0.00 ETH",
      type: "verifier-attest",
      status: passed ? "confirmed" : "failed",
      blockNumber,
      timestamp: "Just now",
      timeMillis: Date.now(),
      jobId,
      nodeType: passed ? "normal" : "mule",
    });
  });

  // 6. Payment released
  escrow.on("PaymentReleased", (jobId: string, machineId: string, wallet: string, amount: bigint, event: any) => {
    const txHash = event?.log?.transactionHash || `0x${jobId.slice(2, 66)}`;
    const blockNumber = event?.log?.blockNumber;
    console.log(
      `[event] PaymentReleased job=${jobId.slice(0, 10)}… machine=${machineIdToString(machineId)} wallet=${wallet} amount=${amount}`
    );
    upsertJob(jobId, { stage: "paid" });
    recordAndEmitTx({
      id: `evt-${jobId.slice(0, 8)}-paid`,
      txHash,
      from: cfg.addresses.JobEscrow,
      to: wallet,
      amount: `${formatEther(amount)} ${cfg.nativeToken}`,
      type: "escrow-release",
      status: "confirmed",
      blockNumber,
      timestamp: "Just now",
      timeMillis: Date.now(),
      jobId,
      nodeType: "normal",
    });
  });

  // 7. Job refunded
  escrow.on("JobRefunded", (jobId: string, customer: string, amount: bigint, reason: number, event: any) => {
    const txHash = event?.log?.transactionHash || `0x${jobId.slice(2, 66)}`;
    const blockNumber = event?.log?.blockNumber;
    const reasons = ["CUSTOMER_CANCELLED", "EXPIRED", "VERIFICATION_FAILED"];
    console.log(
      `[event] JobRefunded job=${jobId.slice(0, 10)}… customer=${customer} amount=${amount} reason=${reasons[reason] ?? reason}`
    );
    upsertJob(jobId, { stage: "refunded" });
    recordAndEmitTx({
      id: `evt-${jobId.slice(0, 8)}-refund`,
      txHash,
      from: cfg.addresses.JobEscrow,
      to: customer,
      amount: `${formatEther(amount)} ${cfg.nativeToken}`,
      type: "escrow-refund",
      status: "failed",
      blockNumber,
      timestamp: "Just now",
      timeMillis: Date.now(),
      jobId,
      nodeType: "mule",
    });
  });

  // 8. Machine Registry Registration
  registry.on("MachineRegistered", (machineId: string, owner: string, wallet: string, signer: string, stake: bigint, event: any) => {
    const txHash = event?.log?.transactionHash || `0x${machineId.slice(2, 66)}`;
    const blockNumber = event?.log?.blockNumber;
    console.log(`[event] MachineRegistered machine=${machineIdToString(machineId)} owner=${owner} stake=${formatEther(stake)}`);
    recordAndEmitTx({
      id: `evt-${machineId.slice(0, 8)}-reg`,
      txHash,
      from: owner,
      to: cfg.addresses.MachineRegistry,
      amount: `${formatEther(stake)} ${cfg.nativeToken}`,
      type: "transfer",
      status: "confirmed",
      blockNumber,
      timestamp: "Just now",
      timeMillis: Date.now(),
      nodeType: "contract",
    });
  });

  console.log("[events] listening for all JobEscrow and MachineRegistry events");
}
