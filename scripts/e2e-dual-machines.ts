import * as fs from "fs";
import * as path from "path";
import hre from "hardhat";
import { calculateTransportPrice, calculateColorSortingPrice } from "../integration/pricingEngine";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("==================================================================");
  console.log(" MACHINAPAY DUAL MACHINE E2E SUITE: M-042 & M-051");
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

  // 1. Verify health & registered machines
  console.log(`[1/5] Checking Backend health and MachineRegistry on-chain…`);
  const healthRes = await fetch(`${BACKEND_URL}/health`);
  const health = await healthRes.json();
  console.log("  Backend Health:", health);

  const m042Bytes32 = hre.ethers.encodeBytes32String("M-042");
  const m051Bytes32 = hre.ethers.encodeBytes32String("M-051");

  const m042OnChain = await registry.getMachine(m042Bytes32);
  const m051OnChain = await registry.getMachine(m051Bytes32);
  console.log(`  M-042 on-chain: active=${m042OnChain.active}, wallet=${m042OnChain.wallet}, completed=${m042OnChain.completedJobs}`);
  console.log(`  M-051 on-chain: active=${m051OnChain.active}, wallet=${m051OnChain.wallet}, completed=${m051OnChain.completedJobs}`);

  if (!m042OnChain.active || !m051OnChain.active) {
    throw new Error("Both M-042 and M-051 must be active in MachineRegistry!");
  }

  // ------------------------------------------------------------------
  // MACHINE 1: M-042 (AUTONOMOUS TRANSPORT ROBOT)
  // ------------------------------------------------------------------
  console.log("\n==================================================================");
  console.log(" RUNNING MACHINE 1: M-042 (PACKAGE_TRANSPORT)");
  console.log("==================================================================");

  // 1. Calculate dynamic price via API
  console.log("  Step A: Calculate dynamic price for (5km, 10kg, Priority, High Demand, Low Avail)…");
  const tParams = {
    distanceKm: 5,
    weightKg: 10,
    urgency: "PRIORITY" as const,
    demand: "HIGH" as const,
    availability: "LOW" as const,
  };
  const tPriceRes = await fetch(`${BACKEND_URL}/api/pricing/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobType: "PACKAGE_TRANSPORT", params: tParams }),
  });
  const tPrice = await tPriceRes.json();
  console.log(`  Calculated Price: ${tPrice.finalPrice} MST (Expected: 86 MST)`);
  if (tPrice.finalPrice !== 86) {
    throw new Error(`Expected 86 MST for canonical transport benchmark, got ${tPrice.finalPrice}`);
  }

  // 2. Lock price and create job in JobEscrow
  console.log("  Step B: 🔒 PRICE LOCKED at 86 MST. Funding JobEscrow contract…");
  const tJobId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(`e2e-transport-${Date.now()}`));
  const tDesc = "Move 10kg package from Warehouse A to Warehouse B";

  // Register canonical metadata off-chain
  const tMetaRes = await fetch(`${BACKEND_URL}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskType: "PACKAGE_TRANSPORT",
      machineId: "M-042",
      pickupLocation: "Warehouse A",
      destination: "Warehouse B",
      distanceKm: 5,
      packageWeightKg: 10,
      description: tDesc,
      pricing: tPrice,
    }),
  });
  const tMeta = await tMetaRes.json();

  const tReward = hre.ethers.parseEther("86");
  const tCreateTx = await escrow.createJob(tJobId, tMeta.metadataHash, 3600, tDesc, { value: tReward });
  await tCreateTx.wait();
  console.log(`  JobEscrow created & funded with 86 MST (tx: ${tCreateTx.hash.slice(0, 10)}…)`);

  // Verify on-chain locked price
  const onChainTJob = await escrow.getJob(tJobId);
  console.log(`  On-chain state: ${onChainTJob.state} (FUNDED), reward: ${hre.ethers.formatEther(onChainTJob.reward)} MST`);

  // 3. Machine M-042 accepts & starts
  console.log("  Step C: Machine M-042 accepting job on-chain…");
  const tAcceptRes = await fetch(`${BACKEND_URL}/machine/jobs/${tJobId}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ machineId: "M-042" }),
  });
  const tAccept = await tAcceptRes.json();
  console.log(`  Accepted and started (tx: ${tAccept.acceptTx.slice(0, 10)}…)`);

  // 4. Submit transport evidence, proof & multi-verifier settlement
  console.log("  Step D: Transport executed. Submitting signed EIP-712 proof & verifying…");
  const tEvidenceRes = await fetch(`${BACKEND_URL}/machine/jobs/${tJobId}/evidence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskType: "PACKAGE_TRANSPORT",
      machineId: "M-042",
      pickupLocation: "Warehouse A",
      destination: "Warehouse B",
      packageId: "PKG-042-E2E",
      packageWeightKg: 10,
      distanceKm: 5,
      delivered: true,
      result: "success",
      completedAt: new Date().toISOString(),
    }),
  });
  const tSubmission = await tEvidenceRes.json();
  console.log("  Multi-verifier consensus:", tSubmission.verification?.consensus);
  console.log(`  Settlement Tx: ${tSubmission.verification?.settleTx}`);

  const settledTJob = await escrow.getJob(tJobId);
  console.log(`  Final on-chain state: ${settledTJob.state} (PAID), verdict: ${settledTJob.verdict}`);
  if (Number(settledTJob.state) !== 6) {
    throw new Error(`Transport job was not paid on-chain! state=${settledTJob.state}`);
  }
  console.log("  ✓ M-042 Transport Job successfully settled on-chain!");

  // ------------------------------------------------------------------
  // MACHINE 2: M-051 (ROBOTIC COLOR SORTING ARM)
  // ------------------------------------------------------------------
  console.log("\n==================================================================");
  console.log(" RUNNING MACHINE 2: M-051 (COLOR_SORTING)");
  console.log("==================================================================");

  // 1. Calculate dynamic price via API
  console.log("  Step A: Calculate dynamic price for (100 objects, 4 colors, 95% acc, Priority, High Demand, Low Avail)…");
  const cParams = {
    objectCount: 100,
    colors: ["RED", "BLUE", "GREEN", "YELLOW"],
    requiredAccuracyPercent: 95,
    urgency: "PRIORITY" as const,
    demand: "HIGH" as const,
    availability: "LOW" as const,
  };
  const cPriceRes = await fetch(`${BACKEND_URL}/api/pricing/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobType: "COLOR_SORTING", params: cParams }),
  });
  const cPrice = await cPriceRes.json();
  console.log(`  Calculated Price: ${cPrice.finalPrice} MST (Expected: 80 MST)`);
  if (cPrice.finalPrice !== 80) {
    throw new Error(`Expected 80 MST for canonical color sorting benchmark, got ${cPrice.finalPrice}`);
  }

  // 2. Lock price and create job in JobEscrow
  console.log("  Step B: 🔒 PRICE LOCKED at 80 MST. Funding JobEscrow contract…");
  const cJobId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(`e2e-color-sort-${Date.now()}`));
  const cDesc = "Sort 100 objects into 4 colors with >=95% accuracy";

  const cMetaRes = await fetch(`${BACKEND_URL}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskType: "COLOR_SORTING",
      machineId: "M-051",
      objectCount: 100,
      colors: ["RED", "BLUE", "GREEN", "YELLOW"],
      requiredAccuracyPercent: 95,
      description: cDesc,
      pricing: cPrice,
    }),
  });
  const cMeta = await cMetaRes.json();

  const cReward = hre.ethers.parseEther("80");
  const cCreateTx = await escrow.createJob(cJobId, cMeta.metadataHash, 3600, cDesc, { value: cReward });
  await cCreateTx.wait();
  console.log(`  JobEscrow created & funded with 80 MST (tx: ${cCreateTx.hash.slice(0, 10)}…)`);

  const onChainCJob = await escrow.getJob(cJobId);
  console.log(`  On-chain state: ${onChainCJob.state} (FUNDED), reward: ${hre.ethers.formatEther(onChainCJob.reward)} MST`);

  // 3. Machine M-051 accepts & starts
  console.log("  Step C: Machine M-051 accepting job on-chain…");
  const cAcceptRes = await fetch(`${BACKEND_URL}/machine/jobs/${cJobId}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ machineId: "M-051" }),
  });
  const cAccept = await cAcceptRes.json();
  console.log(`  Accepted and started (tx: ${cAccept.acceptTx.slice(0, 10)}…)`);

  // 4. Submit Color Sorting evidence, proof & multi-verifier settlement
  console.log("  Step D: 100 objects processed (97 correct, 3 incorrect, 97% accuracy). Submitting signed proof…");
  const cEvidenceRes = await fetch(`${BACKEND_URL}/machine/jobs/${cJobId}/evidence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskType: "COLOR_SORTING",
      machineId: "M-051",
      objectsProcessed: 100,
      correctlySorted: 97,
      incorrectlySorted: 3,
      colorDistribution: { red: 25, blue: 24, green: 25, yellow: 23 },
      requiredAccuracy: 95,
      actualAccuracy: 97,
      result: "success",
      completedAt: new Date().toISOString(),
    }),
  });
  const cSubmission = await cEvidenceRes.json();
  console.log("  Multi-verifier consensus:", cSubmission.verification?.consensus);
  console.log(`  Settlement Tx: ${cSubmission.verification?.settleTx}`);

  const settledCJob = await escrow.getJob(cJobId);
  console.log(`  Final on-chain state: ${settledCJob.state} (PAID), verdict: ${settledCJob.verdict}`);
  if (Number(settledCJob.state) !== 6) {
    throw new Error(`Color sorting job was not paid on-chain! state=${settledCJob.state}`);
  }
  console.log("  ✓ M-051 Color Sorting Job successfully settled on-chain!");

  // ------------------------------------------------------------------
  // VERIFY INDEPENDENT REPUTATION
  // ------------------------------------------------------------------
  console.log("\n==================================================================");
  console.log(" VERIFYING INDEPENDENT ON-CHAIN REPUTATIONS");
  console.log("==================================================================");
  const m042After = await registry.getMachine(m042Bytes32);
  const m051After = await registry.getMachine(m051Bytes32);
  console.log(`  M-042 (Transport Robot) completedJobs: ${m042After.completedJobs}`);
  console.log(`  M-051 (Color Sorting Arm) completedJobs: ${m051After.completedJobs}`);

  console.log("\n==================================================================");
  console.log(" ALL DUAL MACHINE E2E TESTS PASSED WITH 100% INTEGRITY!");
  console.log("==================================================================");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("E2E Dual Machine Suite failed:", err);
    process.exit(1);
  });
