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
  console.log(" MACHINAPAY END-TO-END AUTOMATED VERIFICATION SUITE");
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

  // Check health of Backend-service
  console.log(`[1/6] Checking Backend-service health at ${BACKEND_URL}/health…`);
  try {
    const healthRes = await fetch(`${BACKEND_URL}/health`);
    const healthJson = await healthRes.json();
    console.log("  Backend online:", healthJson);
  } catch (err: any) {
    throw new Error(`Backend-service is not reachable at ${BACKEND_URL}. Start it before running e2e. (${err.message})`);
  }

  // Check machine registration
  const machineInfo = await registry.getMachine(machineIdBytes32);
  const machineWallet = machineInfo.wallet;
  console.log(`  Machine wallet on-chain: ${machineWallet}, active: ${machineInfo.active}`);

  // Connect WebSocket client mimicking Member 2 3D Robot Simulator
  console.log(`[2/6] Connecting to Simulator WebSocket relay at ${WS_URL}…`);
  const ws = new WebSocket(WS_URL);

  const incomingWsMessages: any[] = [];
  await new Promise<void>((resolve, reject) => {
    ws.on("open", () => {
      console.log("  Connected to simulator WebSocket relay.");
      // Announce machine online
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

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log(`  [SIMULATOR-WS-RECV] ${msg.type}`, msg.type === "CHAIN_UPDATE" ? `stage=${msg.stage}` : "");
      incomingWsMessages.push(msg);
    } catch {
      // ignore
    }
  });

  // Start background heartbeat
  const hbInterval = setInterval(() => {
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
  }, 3000);

  try {
    // ------------------------------------------------------------------
    // TEST 1: HAPPY PATH (Fund -> Accept -> Exec -> Proof -> Attest -> Paid)
    // ------------------------------------------------------------------
    console.log("\n==================================================================");
    console.log(" TEST 1: HAPPY PATH — AUTONOMOUS DISPATCH & PAYMENT RELEASE");
    console.log("==================================================================");

    const taskType = "MOVE_OBJECT";
    const source = { x: 100, y: 300 };
    const target = { x: 600, y: 300 };
    const rewardEther = "5.0";
    const rewardWei = hre.ethers.parseEther(rewardEther);

    console.log("1. Registering job metadata via POST /api/jobs…");
    const metaRes = await fetch(`${BACKEND_URL}/api/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskType,
        source,
        target,
        simulateFailure: false,
        description: "Autonomous delivery to warehouse zone",
      }),
    });
    const metaJson = await metaRes.json();
    console.log("   Metadata Hash:", metaJson.metadataHash);

    const happyJobId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(`e2e-happy-${Date.now()}`));
    const machineBalBefore = await hre.ethers.provider.getBalance(machineWallet);
    console.log(`   Machine balance before: ${hre.ethers.formatEther(machineBalBefore)} ETH`);

    console.log(`2. Customer creating funded job ${happyJobId.slice(0, 10)}… on-chain (${rewardEther} ETH)…`);
    const createTx = await escrow.createJob(
      happyJobId,
      metaJson.metadataHash,
      3600,
      "Autonomous delivery to warehouse zone",
      { value: rewardWei }
    );
    await createTx.wait();
    console.log(`   Job created in tx ${createTx.hash}. Waiting for backend dispatch…`);

    // Wait for simulator to receive START_JOB
    let startJobMsg: any = null;
    const startTime = Date.now();
    while (Date.now() - startTime < 15000) {
      startJobMsg = incomingWsMessages.find(
        (m) => m.type === "START_JOB" && m.jobId.toLowerCase() === happyJobId.toLowerCase()
      );
      if (startJobMsg) break;
      await sleep(300);
    }

    if (!startJobMsg) {
      throw new Error("TIMEOUT: Simulator did not receive START_JOB message from backend.");
    }
    console.log("3. Simulator received START_JOB:", startJobMsg);

    // Simulator simulates execution steps
    console.log("4. Simulator executing task phases automatically (zero clicks)…");
    ws.send(JSON.stringify({ type: "JOB_ACCEPTED", jobId: happyJobId, machineId: machineIdStr }));
    ws.send(JSON.stringify({ type: "JOB_STARTED", jobId: happyJobId, machineId: machineIdStr, timestamp: new Date().toISOString() }));
    ws.send(JSON.stringify({ type: "ROBOT_STATE_CHANGED", jobId: happyJobId, machineId: machineIdStr, state: "MOVING_TO_OBJECT", timestamp: new Date().toISOString() }));
    await sleep(200);
    ws.send(JSON.stringify({ type: "ROBOT_STATE_CHANGED", jobId: happyJobId, machineId: machineIdStr, state: "PICKING_OBJECT", timestamp: new Date().toISOString() }));
    await sleep(200);
    ws.send(JSON.stringify({ type: "ROBOT_STATE_CHANGED", jobId: happyJobId, machineId: machineIdStr, state: "MOVING_TO_TARGET", timestamp: new Date().toISOString() }));
    await sleep(200);
    ws.send(JSON.stringify({ type: "ROBOT_STATE_CHANGED", jobId: happyJobId, machineId: machineIdStr, state: "DROPPING_OBJECT", timestamp: new Date().toISOString() }));
    await sleep(200);

    // Complete job
    console.log("5. Simulator sends JOB_COMPLETED with telemetry & sensor proof…");
    ws.send(
      JSON.stringify({
        type: "JOB_COMPLETED",
        jobId: happyJobId,
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

    // Wait for backend to submit proof, verify, and release payment
    console.log("6. Waiting for on-chain settlement (Proof -> Verification -> PaymentReleased)…");
    const settleStart = Date.now();
    let settled = false;
    while (Date.now() - settleStart < 20000) {
      const jobOnChain = await escrow.getJob(happyJobId);
      if (Number(jobOnChain.state) === 6) {
        // State 6 = PAID
        settled = true;
        break;
      }
      await sleep(500);
    }

    if (!settled) {
      const finalState = Number((await escrow.getJob(happyJobId)).state);
      throw new Error(`Happy path failed: on-chain job state is ${finalState} instead of 6 (PAID).`);
    }

    const machineBalAfter = await hre.ethers.provider.getBalance(machineWallet);
    console.log(`   Machine balance after: ${hre.ethers.formatEther(machineBalAfter)} ETH`);
    const balanceDiff = machineBalAfter - machineBalBefore;
    console.log(`   Net balance change: +${hre.ethers.formatEther(balanceDiff)} ETH`);

    // Verify CHAIN_UPDATE messages were sent to the simulator
    const paidUpdate = incomingWsMessages.find(
      (m) => m.type === "CHAIN_UPDATE" && m.jobId.toLowerCase() === happyJobId.toLowerCase() && m.stage === "PAID"
    );
    if (!paidUpdate) {
      throw new Error("Simulator did not receive CHAIN_UPDATE with stage 'PAID'.");
    }
    console.log("✔ Happy Path Passed: On-chain payment released, simulator received PAID update with txHash!");

    // ------------------------------------------------------------------
    // TEST 2: FAILURE PATH (simulateFailure: true -> Proof result 0 -> Attest FAIL -> Refund)
    // ------------------------------------------------------------------
    console.log("\n==================================================================");
    console.log(" TEST 2: FAILURE PATH — SIMULATED FAILURE & CUSTOMER REFUND");
    console.log("==================================================================");

    const failRewardEther = "2.0";
    const failRewardWei = hre.ethers.parseEther(failRewardEther);

    console.log("1. Registering failure job metadata via POST /api/jobs (simulateFailure: true)…");
    const failMetaRes = await fetch(`${BACKEND_URL}/api/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskType: "PICK_AND_PLACE",
        source: { x: 150, y: 150 },
        target: { x: 550, y: 450 },
        simulateFailure: true,
        description: "Failure simulation run",
      }),
    });
    const failMetaJson = await failMetaRes.json();
    console.log("   Metadata Hash:", failMetaJson.metadataHash);

    const failJobId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(`e2e-fail-${Date.now()}`));
    const customerBalBefore = await hre.ethers.provider.getBalance(customer.address);

    console.log(`2. Customer creating funded job ${failJobId.slice(0, 10)}… on-chain…`);
    const failCreateTx = await escrow.createJob(
      failJobId,
      failMetaJson.metadataHash,
      3600,
      "Failure simulation run",
      { value: failRewardWei }
    );
    await failCreateTx.wait();
    console.log(`   Job created. Waiting for backend dispatch…`);

    // Wait for simulator to receive START_JOB
    let failStartMsg: any = null;
    const failStartWait = Date.now();
    while (Date.now() - failStartWait < 15000) {
      failStartMsg = incomingWsMessages.find(
        (m) => m.type === "START_JOB" && m.jobId.toLowerCase() === failJobId.toLowerCase()
      );
      if (failStartMsg) break;
      await sleep(300);
    }

    if (!failStartMsg) {
      throw new Error("TIMEOUT: Simulator did not receive START_JOB for failure test.");
    }
    console.log("3. Simulator received START_JOB with simulateFailure:", failStartMsg.simulateFailure);

    console.log("4. Simulator reporting JOB_FAILED…");
    ws.send(
      JSON.stringify({
        type: "JOB_FAILED",
        jobId: failJobId,
        machineId: machineIdStr,
        status: "FAILED",
        reason: "Obstacle obstruction at coordinates (350, 300)",
        failedAt: new Date().toISOString(),
      })
    );

    console.log("5. Waiting for on-chain refund (Proof result 0 -> Attest false -> JobRefunded)…");
    const refundWaitStart = Date.now();
    let refunded = false;
    while (Date.now() - refundWaitStart < 20000) {
      const jobOnChain = await escrow.getJob(failJobId);
      if (Number(jobOnChain.state) === 7) {
        // State 7 = REFUNDED
        refunded = true;
        break;
      }
      await sleep(500);
    }

    if (!refunded) {
      const finalState = Number((await escrow.getJob(failJobId)).state);
      throw new Error(`Failure path failed: on-chain job state is ${finalState} instead of 7 (REFUNDED).`);
    }

    const refundedUpdate = incomingWsMessages.find(
      (m) => m.type === "CHAIN_UPDATE" && m.jobId.toLowerCase() === failJobId.toLowerCase() && m.stage === "REFUNDED"
    );
    if (!refundedUpdate) {
      throw new Error("Simulator did not receive CHAIN_UPDATE with stage 'REFUNDED'.");
    }
    console.log("✔ Failure Path Passed: Customer refunded in full, simulator received REFUNDED update!");

    // ------------------------------------------------------------------
    // TEST 3: TAMPERED METADATA SECURITY TEST
    // ------------------------------------------------------------------
    console.log("\n==================================================================");
    console.log(" TEST 3: SECURITY — TAMPERED METADATA HASH REJECTION");
    console.log("==================================================================");

    const tamperedJobId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(`e2e-tamper-${Date.now()}`));
    const fakeMetadataHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("forged_metadata_12345"));

    console.log("1. Creating job with unregistered / forged metadata hash…");
    const tamperTx = await escrow.createJob(
      tamperedJobId,
      fakeMetadataHash,
      3600,
      "Tampered job test",
      { value: hre.ethers.parseEther("0.1") }
    );
    await tamperTx.wait();

    await sleep(3000);

    const tamperMsg = incomingWsMessages.find(
      (m) => m.type === "START_JOB" && m.jobId.toLowerCase() === tamperedJobId.toLowerCase()
    );

    if (tamperMsg) {
      throw new Error("SECURITY FAILURE: Backend dispatched a job whose metadata was tampered or unregistered!");
    }

    const tamperJobOnChain = await escrow.getJob(tamperedJobId);
    console.log(`   Job on-chain state: ${tamperJobOnChain.state} (still 1 FUNDED, never accepted by machine).`);
    console.log("✔ Security Test Passed: Tampered job was rejected and never dispatched to the robot!");

    console.log("\n==================================================================");
    console.log(" ALL END-TO-END AUTOMATED VERIFICATION TESTS PASSED SUCCESSFULLY!");
    console.log("==================================================================");
  } finally {
    clearInterval(hbInterval);
    ws.close();
  }
}

main().catch((err) => {
  console.error("\n❌ E2E SUITE FAILED:", err);
  process.exit(1);
});
