import * as fs from "fs";
import * as path from "path";
import hre from "hardhat";
import { WebSocket } from "ws";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";
const WS_URL = process.env.WS_URL || "ws://localhost:4000/ws";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("==================================================================");
  console.log(" BRIDGEKEY -> ON-CHAIN -> SIMULATOR -> SETTLEMENT FLOW CHECK");
  console.log("==================================================================");

  const signers = await hre.ethers.getSigners();
  const [deployer, customer] = signers;

  const contractsPath = path.join(__dirname, "..", "integration", "machinapay.contracts.json");
  if (!fs.existsSync(contractsPath)) {
    throw new Error("machinapay.contracts.json not found. Run deploy:local first.");
  }
  const cfg = JSON.parse(fs.readFileSync(contractsPath, "utf8"));

  const escrow = await hre.ethers.getContractAt("JobEscrow", cfg.addresses.JobEscrow, customer);
  const registry = await hre.ethers.getContractAt("MachineRegistry", cfg.addresses.MachineRegistry, deployer);

  const machineIdStr = "M-042";
  const machineIdBytes32 = hre.ethers.encodeBytes32String(machineIdStr);

  // 1. Health check & LAN info
  console.log(`\n[Hop 0] Checking Backend health at ${BACKEND_URL}/health…`);
  const healthRes = await fetch(`${BACKEND_URL}/health`);
  if (!healthRes.ok) {
    throw new Error(`Backend health check failed: HTTP ${healthRes.status}`);
  }
  const healthJson = await healthRes.json();
  console.log("  Backend Health Status:", JSON.stringify(healthJson, null, 2));

  // Connect mock simulator WebSocket client to observe WS communication
  console.log(`\n[Hop 0] Connecting Simulator WebSocket listener at ${WS_URL}…`);
  const ws = new WebSocket(WS_URL);
  const receivedWsMessages: any[] = [];

  await new Promise<void>((resolve, reject) => {
    ws.on("open", () => {
      console.log("  Simulator WS connected. Announcing MACHINE_ONLINE…");
      ws.send(
        JSON.stringify({
          type: "MACHINE_ONLINE",
          machineId: machineIdStr,
          timestamp: new Date().toISOString(),
        })
      );
      resolve();
    });
    ws.on("error", (err) => reject(err));
  });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      console.log(`  [SIMULATOR-WS-RECV] ${msg.type}`, msg.type === "CHAIN_UPDATE" ? `stage=${msg.stage} tx=${msg.txHash}` : "");
      receivedWsMessages.push(msg);
    } catch {
      // ignore
    }
  });

  const hb = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "HEARTBEAT",
          machineId: machineIdStr,
          state: "IDLE",
          timestamp: new Date().toISOString(),
        })
      );
    }
  }, 2000);

  try {
    // -------------------------------------------------------------------------
    // Hop 1: Frontend registers canonical metadata with backend
    // -------------------------------------------------------------------------
    console.log(`\n[Hop 1] Frontend registers canonical metadata at POST ${BACKEND_URL}/api/jobs…`);
    const taskType = "PACKAGE_TRANSPORT";
    const source = { x: 120, y: 250 };
    const target = { x: 580, y: 250 };
    const description = "Autonomous package transport via BridgeKey trigger";
    const rewardEther = "2.5";
    const rewardWei = hre.ethers.parseEther(rewardEther);

    const metaRes = await fetch(`${BACKEND_URL}/api/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskType,
        source,
        target,
        machineId: machineIdStr,
        description,
        simulateFailure: false,
      }),
    });

    if (!metaRes.ok) {
      throw new Error(`Hop 1 Failed: Metadata registration returned HTTP ${metaRes.status}`);
    }
    const metaJson = await metaRes.json();
    const metadataHash = metaJson.metadataHash;
    if (!metadataHash || !metadataHash.startsWith("0x")) {
      throw new Error("Hop 1 Failed: Backend did not return a valid metadataHash");
    }
    console.log(`  Metadata registered successfully. Hash: ${metadataHash}`);

    // -------------------------------------------------------------------------
    // Hop 2: Customer approves job creation in BridgeKey / On-chain Escrow
    // -------------------------------------------------------------------------
    const jobId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(`bridgekey-job-${Date.now()}`));
    console.log(`\n[Hop 2] Customer signs createJob in BridgeKey -> Escrow.createJob(${jobId.slice(0, 10)}…)`);
    const tx = await escrow.createJob(
      jobId,
      metadataHash,
      3600,
      description,
      { value: rewardWei }
    );
    const receipt = await tx.wait();
    console.log(`  JobEscrow.createJob mined in block #${receipt.blockNumber}, txHash=${tx.hash}`);

    // -------------------------------------------------------------------------
    // Hop 3: Chain listener detects JobCreated & Enqueues job
    // -------------------------------------------------------------------------
    console.log(`\n[Hop 3] Asserting Backend chainListener detected event & enqueued job…`);
    let jobFromBackend: any = null;
    const pollStart = Date.now();
    while (Date.now() - pollStart < 12000) {
      const jRes = await fetch(`${BACKEND_URL}/jobs/${jobId}`);
      if (jRes.ok) {
        jobFromBackend = await jRes.json();
        if (jobFromBackend.stage && jobFromBackend.stage !== "error") {
          break;
        }
      }
      await sleep(300);
    }

    if (!jobFromBackend) {
      throw new Error("Hop 3 Failed: Backend did not detect and enqueue the job within 12 seconds.");
    }
    console.log(`  Backend job state asserted: stage="${jobFromBackend.stage}", queueInfo:`, jobFromBackend.queueInfo);

    // -------------------------------------------------------------------------
    // Hop 4: Simulator receives START_JOB over WebSocket
    // -------------------------------------------------------------------------
    console.log(`\n[Hop 4] Asserting START_JOB dispatched over WebSocket to Simulator…`);
    let startJobMsg: any = null;
    const wsWaitStart = Date.now();
    while (Date.now() - wsWaitStart < 15000) {
      startJobMsg = receivedWsMessages.find(
        (m) => m.type === "START_JOB" && m.jobId.toLowerCase() === jobId.toLowerCase()
      );
      if (startJobMsg) break;
      await sleep(200);
    }

    if (!startJobMsg) {
      throw new Error("Hop 4 Failed: Simulator did not receive START_JOB message via WebSocket.");
    }
    console.log(`  START_JOB message received: machineId=${startJobMsg.machineId}, taskType=${startJobMsg.taskType}`);
    if (startJobMsg.machineId !== machineIdStr) {
      throw new Error(`Hop 4 Failed: Expected machineId ${machineIdStr} but got ${startJobMsg.machineId}`);
    }

    // -------------------------------------------------------------------------
    // Hop 5: 3D Robot Simulator executes phases & emits JOB_COMPLETED (no user clicks)
    // -------------------------------------------------------------------------
    console.log(`\n[Hop 5] Simulator executing autonomous kinematics (zero manual clicks)…`);
    ws.send(JSON.stringify({ type: "JOB_ACCEPTED", jobId, machineId: machineIdStr }));
    ws.send(JSON.stringify({ type: "JOB_STARTED", jobId, machineId: machineIdStr, timestamp: new Date().toISOString() }));
    ws.send(JSON.stringify({ type: "ROBOT_STATE_CHANGED", jobId, machineId: machineIdStr, state: "MOVING_TO_OBJECT", timestamp: new Date().toISOString() }));
    await sleep(150);
    ws.send(JSON.stringify({ type: "ROBOT_STATE_CHANGED", jobId, machineId: machineIdStr, state: "PICKING_OBJECT", timestamp: new Date().toISOString() }));
    await sleep(150);
    ws.send(JSON.stringify({ type: "ROBOT_STATE_CHANGED", jobId, machineId: machineIdStr, state: "MOVING_TO_TARGET", timestamp: new Date().toISOString() }));
    await sleep(150);
    ws.send(JSON.stringify({ type: "ROBOT_STATE_CHANGED", jobId, machineId: machineIdStr, state: "DROPPING_OBJECT", timestamp: new Date().toISOString() }));
    await sleep(150);

    console.log(`  Simulator emits JOB_COMPLETED with sensor verification…`);
    ws.send(
      JSON.stringify({
        type: "JOB_COMPLETED",
        jobId,
        machineId: machineIdStr,
        status: "SUCCESS",
        taskType,
        sourcePosition: source,
        targetPosition: target,
        finalPosition: target,
        objectDelivered: true,
        completedAt: new Date().toISOString(),
      })
    );

    // -------------------------------------------------------------------------
    // Hop 6: Backend signs EIP-712 proof, Verifier Attests, and Escrow Settles (PAID)
    // -------------------------------------------------------------------------
    console.log(`\n[Hop 6] Waiting for on-chain settlement: Proof -> Attestation -> PaymentReleased…`);
    const settleStart = Date.now();
    let settled = false;
    let finalJobState = -1;

    while (Date.now() - settleStart < 25000) {
      const onChainJob = await escrow.getJob(jobId);
      finalJobState = Number(onChainJob.state);
      if (finalJobState === 6) {
        // State 6 = PAID
        settled = true;
        break;
      }
      await sleep(500);
    }

    if (!settled) {
      throw new Error(`Hop 6 Failed: On-chain state is ${finalJobState} instead of 6 (PAID).`);
    }

    // Verify CHAIN_UPDATE messages reached simulator
    const paidUpdate = receivedWsMessages.find(
      (m) => m.type === "CHAIN_UPDATE" && m.jobId.toLowerCase() === jobId.toLowerCase() && m.stage === "PAID"
    );
    if (!paidUpdate) {
      console.warn("  Warning: Simulator did not capture CHAIN_UPDATE with stage 'PAID'");
    } else {
      console.log(`  Simulator received CHAIN_UPDATE (PAID): txHash=${paidUpdate.txHash}, amount=${paidUpdate.amount} ETH`);
    }

    console.log("\n==================================================================");
    console.log(" ✔ ALL 6 HOPS VERIFIED SUCCESSFULLY: BRIDGEKEY -> ON-CHAIN -> SIMULATOR -> PAID");
    console.log("==================================================================");
  } finally {
    clearInterval(hb);
    ws.close();
  }
}

main().catch((err) => {
  console.error("\n❌ BRIDGEKEY FLOW CHECK FAILED:", err);
  process.exit(1);
});
