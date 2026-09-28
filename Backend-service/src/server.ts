import "dotenv/config";
import express from "express";
import cors from "cors";
import { cfg, getEscrow } from "./config";
import { acceptAndStart, submitEvidenceAndProof, getMachineAddress, MACHINE_ID_TEXT } from "./machineAgent";
import { verifyAndSettle, getVerifierAddress, VerifyRequest } from "./verifierService";
import { getJob, listJobs, upsertJob } from "./store";
import { startEventListeners } from "./events";

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

// ---------------------------------------------------------------- job status (for Member 4)
app.get("/jobs", (_req, res) => {
  res.json(listJobs());
});

app.get("/jobs/:jobId", (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "unknown job (not seen by this service yet)" });
  res.json(job);
});

// ---------------------------------------------------------------- MACHINE AGENT routes
/** Member 4 (or a poller watching JobCreated) calls this to have the machine accept + start. */
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

/**
 * Member 2's robot simulation calls this when the job is physically "done".
 * Body: { packageId, target: {zone,x,y}, finalPosition: {x,y}, delivered, result?: "success"|"fail" }
 *
 * This signs + submits the on-chain proof, then forwards proof+evidence to the
 * verifier itself (over HTTP, per the suggested contract in the hand-off doc —
 * point VERIFIER_URL at a different host/port to run them as two real services).
 */
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
/** Standalone endpoint: { jobId, proof, signature, evidence } -> { passed, checks, attestationTx, settleTx } */
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

app.listen(PORT, () => {
  console.log(`Member 3 service (machine agent + verifier) listening on :${PORT}`);
  console.log(`  machine wallet:  ${getMachineAddress()} (${MACHINE_ID_TEXT})`);
  console.log(`  verifier wallet: ${getVerifierAddress()}`);
  if (getVerifierAddress().toLowerCase() !== cfg.verifier.toLowerCase()) {
    const msg = `FATAL CONFIG MISMATCH: verifier address ${getVerifierAddress()} does not match JobEscrow verifier ${cfg.verifier}`;
    console.error(msg);
    throw new Error(msg);
  }
  startEventListeners();
});
