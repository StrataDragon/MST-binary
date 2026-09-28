import "dotenv/config";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { cfg, getEscrow } from "./config";
import { acceptAndStart, submitEvidenceAndProof, getMachineAddress, MACHINE_ID_TEXT } from "./machineAgent";
import { verifyAndSettle, getVerifierAddress, VerifyRequest } from "./verifierService";
import { getJob, listJobs, upsertJob } from "./store";
import { startChainListener } from "./chainListener";
import { storeMetadata, getMetadataByHash } from "./metadataStore";
import { getEvidence, listAllEvidence } from "./evidenceStore";
import { handleSimulatorMessage, removeMachineSocket } from "./simulatorRelay";
import { getTransactions, addSseClient, addWsClient, recordAndEmitTx, TransactionItem } from "./transactionStore";

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
    machine: { address: getMachineAddress(), machineId: MACHINE_ID_TEXT },
    verifier: { address: getVerifierAddress() },
  });
});

// ---------------------------------------------------------------- metadata API
/** Off-chain job metadata endpoint: saves task parameters, returns canonical JSON + keccak256 hash */
app.post("/api/jobs", (req, res) => {
  const { taskType, source, target, simulateFailure, description } = req.body ?? {};
  const stored = storeMetadata({ taskType, source, target, simulateFailure, description });
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
  try {
    const result = await acceptAndStart(jobId);
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
    const { packageId, target, finalPosition, delivered, result } = req.body ?? {};
    if (!packageId || !target || !finalPosition || typeof delivered !== "boolean") {
      return res.status(400).json({
        error: "expected { packageId, target:{zone,x,y}, finalPosition:{x,y}, delivered:boolean }",
      });
    }

    const submission = await submitEvidenceAndProof(
      jobId,
      { packageId, target, finalPosition, delivered },
      result === "fail" ? "fail" : "success"
    );

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
