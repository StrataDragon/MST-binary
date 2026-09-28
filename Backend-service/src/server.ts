import "dotenv/config";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { cfg, getEscrow } from "./config";
import {
  acceptAndStart,
  submitEvidenceAndProof,
  submitGenericEvidenceAndProof,
  getMachineAddress,
  MACHINE_ID_TEXT,
} from "./machineAgent";
import { verifyAndSettle, getVerifierAddress, VerifyRequest } from "./verifierService";
import { getJob, listJobs, upsertJob } from "./store";
import { startChainListener } from "./chainListener";
import { storeMetadata, getMetadataByHash } from "./metadataStore";
import { getEvidence, listAllEvidence } from "./evidenceStore";
import { handleSimulatorMessage, removeMachineSocket } from "./simulatorRelay";
import { getTransactions, addSseClient, addWsClient, recordAndEmitTx, TransactionItem } from "./transactionStore";
import { calculateJobPrice, JobType } from "./pricingEngine";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 4000);
const SELF_URL = process.env.SELF_URL || `http://localhost:${PORT}`;

/** Turns an ethers revert into the contract's actual custom error name + args,
 * e.g. "InvalidState(4, 1)" instead of an opaque hex blob. */
function decodeError(e: any): string {
  try {
    const escrow = getEscrow();
    const data = e?.data ?? e?.info?.error?.data ?? e?.error?.data;
    if (!data) return e?.shortMessage || e?.message || String(e);
    const parsed = escrow.interface.parseError(data);
    if (!parsed) return e?.shortMessage || e?.message || String(e);
    return `${parsed.name}(${parsed.args.join(", ")})`;
  } catch {
    return e?.shortMessage || e?.message || String(e);
  }
}

// ---------------------------------------------------------------- health
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    machine: { address: getMachineAddress("M-042"), machineId: "M-042" },
    machine051: { address: getMachineAddress("M-051"), machineId: "M-051" },
    verifier: { address: getVerifierAddress() },
  });
});

// ---------------------------------------------------------------- dynamic pricing API
/** Common deterministic dynamic pricing engine for both M-042 and M-051 */
app.post("/api/pricing/calculate", (req, res) => {
  try {
    const { jobType, params } = req.body ?? {};
    if (!jobType) {
      return res.status(400).json({ error: "jobType is required (PACKAGE_TRANSPORT or COLOR_SORTING)" });
    }
    const calculation = calculateJobPrice(jobType as JobType, params || {});
    res.json(calculation);
  } catch (err: any) {
    res.status(400).json({ error: err.message || String(err) });
  }
});

// ---------------------------------------------------------------- metadata API
/** Off-chain job metadata endpoint: saves task parameters, returns canonical JSON + keccak256 hash */
app.post("/api/jobs", (req, res) => {
  const {
    taskType,
    source,
    target,
    simulateFailure,
    description,
    machineId,
    pickupLocation,
    destination,
    distanceKm,
    packageWeightKg,
    objectCount,
    colors,
    requiredAccuracyPercent,
    pricing,
  } = req.body ?? {};
  const stored = storeMetadata({
    taskType,
    source,
    target,
    simulateFailure,
    description,
    machineId,
    pickupLocation,
    destination,
    distanceKm,
    packageWeightKg,
    objectCount,
    colors,
    requiredAccuracyPercent,
    pricing,
  });
  res.json(stored);
});

app.get("/api/jobs/metadata/:hash", (req, res) => {
  const meta = getMetadataByHash(req.params.hash);
  if (!meta) return res.status(404).json({ error: "metadata not found" });
  res.json(meta);
});

// ---------------------------------------------------------------- evidence API
/** Off-chain evidence retrieval keyed by jobId */
app.get("/api/evidence/:jobId", (req, res) => {
  const ev = getEvidence(req.params.jobId);
  if (!ev) return res.status(404).json({ error: "evidence not found" });
  res.json(ev);
});

app.get("/api/evidence", (_req, res) => {
  res.json(listAllEvidence());
});

// ---------------------------------------------------------------- transactions API & SSE Stream
/** Returns all past ledger and simulated transactions */
app.get("/api/transactions", (_req, res) => {
  res.json(getTransactions());
});

/** Server-Sent Events (SSE) live transaction stream for Typology Radar and live feed */
app.get("/api/transactions/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  if (typeof (res as any).flushHeaders === "function") {
    (res as any).flushHeaders();
  }

  const cleanup = addSseClient(res);
  req.on("close", cleanup);
});

/** Simulate a test transaction (normal, suspicious, or mule aggregator) */
app.post("/api/transactions/simulate", (req, res) => {
  const { from, to, amount, type, nodeType, status } = req.body ?? {};
  const pseudoHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  const item: TransactionItem = {
    id: `sim-${Date.now()}`,
    txHash: pseudoHash,
    from: from || "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    to: to || cfg.addresses.JobEscrow,
    amount: amount || "10.0 ETH",
    type: type || "transfer",
    status: status || "confirmed",
    gasUsed: "21,000 gas",
    blockNumber: Math.floor(Math.random() * 100) + 1,
    timestamp: "Just now",
    timeMillis: Date.now(),
    nodeType: nodeType || "normal",
  };
  recordAndEmitTx(item);
  res.json({ ok: true, transaction: item });
});

// ---------------------------------------------------------------- job status
app.get("/jobs", (_req, res) => {
  res.json(listJobs());
});

app.get("/jobs/:jobId", (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "unknown job (not seen by this service yet)" });
  res.json(job);
});

// ---------------------------------------------------------------- MACHINE AGENT routes
app.post("/machine/jobs/:jobId/accept", async (req, res) => {
  const jobId = req.params.jobId;
  const { machineId } = req.body ?? {};
  try {
    const result = await acceptAndStart(jobId, machineId || "M-042");
    res.json(result);
  } catch (e: any) {
    const error = decodeError(e);
    upsertJob(jobId, { stage: "error", error });
    res.status(400).json({ error });
  }
});

app.post("/machine/jobs/:jobId/evidence", async (req, res) => {
  const jobId = req.params.jobId;
  try {
    const body = req.body ?? {};
    let submission: any;

    if (body.taskType === "COLOR_SORTING" || body.objectsProcessed !== undefined) {
      // Color sorting arm (M-051)
      const evidence = {
        jobId,
        machineId: body.machineId || "M-051",
        taskType: "COLOR_SORTING",
        objectsProcessed: Number(body.objectsProcessed) || 100,
        correctlySorted: Number(body.correctlySorted) || 97,
        incorrectlySorted: Number(body.incorrectlySorted) || 3,
        colorDistribution: body.colorDistribution || { red: 25, blue: 24, green: 25, yellow: 23 },
        requiredAccuracy: Number(body.requiredAccuracy) || 95,
        actualAccuracy: Number(body.actualAccuracy) || 97,
        completedAt: body.completedAt || new Date().toISOString(),
      };
      submission = await submitGenericEvidenceAndProof(
        jobId,
        evidence,
        body.result === "fail" ? "fail" : "success",
        evidence.machineId
      );
    } else if (body.taskType === "PACKAGE_TRANSPORT" || body.pickupLocation !== undefined) {
      // Transport robot (M-042)
      const evidence = {
        jobId,
        machineId: body.machineId || "M-042",
        taskType: "PACKAGE_TRANSPORT",
        pickupLocation: body.pickupLocation || "Warehouse A",
        destination: body.destination || "Warehouse B",
        packageId: body.packageId || "PKG-042-ALPHA",
        packageWeightKg: Number(body.packageWeightKg || body.packageWeight || 10),
        distanceKm: Number(body.distanceKm || body.distance || 5),
        completedAt: body.completedAt || new Date().toISOString(),
        delivered: body.delivered !== false,
      };
      submission = await submitGenericEvidenceAndProof(
        jobId,
        evidence,
        body.result === "fail" ? "fail" : "success",
        evidence.machineId
      );
    } else {
      // Standard robot simulation evidence
      const { packageId, target, finalPosition, delivered, result, machineId } = body;
      if (!packageId || !target || !finalPosition || typeof delivered !== "boolean") {
        return res.status(400).json({
          error: "expected { packageId, target:{zone,x,y}, finalPosition:{x,y}, delivered:boolean } or taskType: PACKAGE_TRANSPORT | COLOR_SORTING",
        });
      }
      submission = await submitEvidenceAndProof(
        jobId,
        { packageId, target, finalPosition, delivered },
        result === "fail" ? "fail" : "success",
        machineId || "M-042"
      );
    }

    const verifierUrl = process.env.VERIFIER_URL || `${SELF_URL}/verifier/verify`;
    const verifyRes = await fetch(verifierUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        proof: submission.proof,
        signature: submission.signature,
        evidence: submission.evidence,
      }),
    });
    const verification = await verifyRes.json();

    res.json({ ...submission, verification });
  } catch (e: any) {
    const error = decodeError(e);
    upsertJob(jobId, { stage: "error", error });
    res.status(400).json({ error });
  }
});

// ---------------------------------------------------------------- VERIFIER routes
app.post("/verifier/verify", async (req, res) => {
  const body = req.body as VerifyRequest;
  try {
    const result = await verifyAndSettle(body);
    res.json(result);
  } catch (e: any) {
    const error = decodeError(e);
    upsertJob(body?.jobId, { stage: "error", error });
    res.status(400).json({ error });
  }
});

// ---------------------------------------------------------------- CONSOLIDATED WORKFLOW ENDPOINTS (Section 2)
app.post("/jobs/:jobId/execute", async (req, res) => {
  const jobId = req.params.jobId;
  const { machineId, taskType, simulateFailure, demoFail } = req.body ?? {};
  try {
    const escrow = getEscrow();
    const onChainJob = await escrow.getJob(jobId);
    const state = Number(onChainJob.state);
    if (state === 0) {
      return res.status(400).json({ error: "Job is not funded on-chain yet (state 0). Customer must fund escrow first." });
    }

    const assignedMachine = machineId || (taskType === "COLOR_SORTING" ? "M-051" : "M-042");

    // 1. Accept & Start if in FUNDED state
    if (state === 1) {
      await acceptAndStart(jobId, assignedMachine);
    }

    // 2. Build evidence based on machine type and demo failure flag
    const isFail = Boolean(simulateFailure || demoFail);
    let evidenceResult: any;

    if (assignedMachine === "M-051" || taskType === "COLOR_SORTING") {
      // Color Sorting Arm demo: success = 97% accuracy, failure = 88% accuracy (vs 95% required)
      const evidence = {
        jobId,
        machineId: "M-051",
        taskType: "COLOR_SORTING",
        objectsProcessed: 100,
        correctlySorted: isFail ? 88 : 97,
        incorrectlySorted: isFail ? 12 : 3,
        colorDistribution: { red: 25, blue: 25, green: 25, yellow: 25 },
        requiredAccuracy: 95,
        actualAccuracy: isFail ? 88 : 97,
        completedAt: new Date().toISOString(),
      };
      evidenceResult = await submitGenericEvidenceAndProof(
        jobId,
        evidence,
        isFail ? "fail" : "success",
        "M-051"
      );
    } else {
      // Transport Robot M-042 demo
      const evidence = {
        jobId,
        machineId: "M-042",
        taskType: "PACKAGE_TRANSPORT",
        pickupLocation: req.body?.pickupLocation || "Warehouse A",
        destination: req.body?.destination || "Warehouse B",
        packageId: req.body?.packageId || "PKG-042",
        packageWeightKg: Number(req.body?.packageWeightKg || 5),
        distanceKm: Number(req.body?.distanceKm || 5),
        completedAt: new Date().toISOString(),
        delivered: !isFail,
      };
      evidenceResult = await submitGenericEvidenceAndProof(
        jobId,
        evidence,
        isFail ? "fail" : "success",
        "M-042"
      );
    }

    res.json({ ok: true, stage: "proof_submitted", jobId, evidenceResult });
  } catch (e: any) {
    const error = decodeError(e);
    upsertJob(jobId, { stage: "error", error });
    res.status(400).json({ error });
  }
});

app.post("/jobs/:jobId/verify", async (req, res) => {
  const jobId = req.params.jobId;
  try {
    const escrow = getEscrow();
    const onChainJob = await escrow.getJob(jobId);
    const state = Number(onChainJob.state);

    if (state < 4) {
      return res.status(400).json({ error: `Job is not ready for verification (state ${state} < 4). Proof must be submitted first.` });
    }

    const evidence = getEvidence(jobId) || req.body?.evidence;
    const body: VerifyRequest = {
      jobId,
      proof: req.body?.proof,
      signature: req.body?.signature,
      evidence,
    };

    const result = await verifyAndSettle(body);
    res.json(result);
  } catch (e: any) {
    const error = decodeError(e);
    upsertJob(jobId, { stage: "error", error });
    res.status(400).json({ error });
  }
});

app.post("/jobs/:jobId/settle", async (req, res) => {
  const jobId = req.params.jobId;
  try {
    const escrow = getEscrow();
    const onChainJob = await escrow.getJob(jobId);
    const state = Number(onChainJob.state);
    const verdict = Number(onChainJob.verdict);

    if (state === 5) {
      // VERIFIED -> release payment to machine
      const tx = await escrow.release(jobId);
      const receipt = await tx.wait();
      upsertJob(jobId, { stage: "paid", txs: { release: receipt.hash } });
      return res.json({ ok: true, action: "release", txHash: receipt.hash });
    } else if (state === 4 && verdict === 2) {
      // PROOF_SUBMITTED with FAIL verdict -> refund customer
      const tx = await escrow.refund(jobId);
      const receipt = await tx.wait();
      upsertJob(jobId, { stage: "refunded", txs: { refund: receipt.hash } });
      return res.json({ ok: true, action: "refund", txHash: receipt.hash });
    } else {
      return res.status(400).json({ error: `Cannot settle job in state ${state} (verdict: ${verdict}).` });
    }
  } catch (e: any) {
    const error = decodeError(e);
    res.status(400).json({ error });
  }
});

// Create HTTP and WebSocket server
const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const url = req.url || "";
  console.log(`[ws] Client connected from ${req.socket.remoteAddress} on ${url}`);

  if (url === "/ws" || url.startsWith("/ws?") || url.startsWith("/ws/")) {
    // Member 2 3D Robot Simulator WebSocket
    ws.on("message", (data) => {
      handleSimulatorMessage(ws, data.toString());
    });
    ws.on("close", () => {
      removeMachineSocket(ws);
    });
    ws.on("error", (err) => {
      console.warn("[ws] Simulator socket error:", err);
      removeMachineSocket(ws);
    });
  } else {
    // Frontend transaction feed WebSocket
    addWsClient(ws);
  }
});

server.listen(PORT, () => {
  console.log(`MachinaPay Backend service listening on :${PORT}`);
  console.log(`  machine wallet:  ${getMachineAddress()} (${MACHINE_ID_TEXT})`);
  console.log(`  verifier wallet: ${getVerifierAddress()}`);
  console.log(`  HTTP API:        http://localhost:${PORT}`);
  console.log(`  Transactions:    http://localhost:${PORT}/api/transactions`);
  console.log(`  Jobs API:        http://localhost:${PORT}/api/jobs`);
  console.log(`  Simulator WS:    ws://localhost:${PORT}/ws`);
  console.log(`  Feed WS:         ws://localhost:${PORT}/api/transactions/ws`);
  if (getVerifierAddress().toLowerCase() !== cfg.verifier.toLowerCase()) {
    const msg = `FATAL CONFIG MISMATCH: verifier address ${getVerifierAddress()} does not match JobEscrow verifier ${cfg.verifier}`;
    console.error(msg);
    throw new Error(msg);
  }
  startChainListener();
});
