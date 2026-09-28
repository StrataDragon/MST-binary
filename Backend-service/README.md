# MachinaPay — Member 3: Machine Agent + Verifier

Machine agent + rule-based verifier backend for the MachinaPay job marketplace demo.
Built on top of Member 1's real integration files (`signing.ts`, ABIs, contract addresses) —
nothing here reinvents the signing/encoding logic, it just wraps it in a runnable service.

**This has been run end-to-end against a live local chain** (deploy → accept → start →
sign+submit proof → verify → release/refund), both the happy path and the failure path,
with real transaction hashes. See "Verified run" below for exactly what that proved.

## What's in here

```
src/
  config.ts           chain provider + contract getters (reads integration/machinapay.contracts.json)
  signing.ts          COPIED AS-IS from Member 1 — do not edit, it's the shared source of truth
  store.ts            in-memory job status cache, for Member 4 to poll
  machineAgent.ts      accept job -> start execution -> sign+submit proof
  verifierService.ts   read chain state -> rule-based checks -> sign+submit attestation -> settle
  events.ts           listens for PaymentReleased / JobRefunded
  server.ts           Express app wiring it all together
scripts/
  demo-client.ts      stands in for Member 2 + Member 4 until they're ready — exercises the full flow
integration/
  machinapay.contracts.json   addresses + ABI + EIP-712 domain (REPLACE with Member 1's latest on redeploy)
  abi/*.json                  raw ABIs (kept for reference; contracts.json already embeds them)
```

## Setup

```bash
npm install
cp .env.example .env   # then fill in MACHINE_PRIVATE_KEY / VERIFIER_PRIVATE_KEY
```

- `MACHINE_PRIVATE_KEY` — the virtual robot's wallet + signer key (same key in this demo).
- `VERIFIER_PRIVATE_KEY` — **its address must exactly match `cfg.verifier`** in
  `integration/machinapay.contracts.json`. That address is baked into `JobEscrow` at deploy
  time by Member 1 and cannot be changed afterwards — send them your verifier address
  *before* they deploy.
- Both wallets need the network's native token to pay gas. On MST testnet, fund the machine
  wallet for accept/start/proof transactions and the verifier wallet for attestation/settlement.
- Whenever Member 1 redeploys (moving from localhost to MST testnet, or redeploying for
  any reason), replace `integration/machinapay.contracts.json` with their fresh copy.
  Ensure its `chainId`, `rpcUrl`, contract addresses, ABI and `verifier` all belong to the
  same deployment. `RPC_URL`, if overridden, must point to that same chain.

## Run it

```bash
npm run dev      # ts-node + nodemon, auto-restarts on file changes
# or
npm run build && npm start   # compile once, run plain JS (faster startup)
```

Then, standing in for Member 2's robot + Member 4's dashboard until they're ready:

```bash
JOB_ID=0x... npm run demo            # happy path
JOB_ID=0x... npm run demo -- fail    # verification fails -> refund
```

Get a `JOB_ID` from whatever process created a job on the currently configured chain
(Member 1's `seed:local`/`seed:mst`, or your own `createJob` call).

## HTTP endpoints

| Method | Path | Who calls it | What it does |
|---|---|---|---|
| GET | `/health` | anyone | machine + verifier wallet addresses, sanity check |
| GET | `/jobs` | Member 4 | all jobs this service has seen, most recent first |
| GET | `/jobs/:jobId` | Member 4 | one job's cached status (stage, tx hashes, checks) |
| POST | `/machine/jobs/:jobId/accept` | Member 4 (or a poller) | machine accepts + starts execution |
| POST | `/machine/jobs/:jobId/evidence` | **Member 2's robot sim** | robot reports final position/delivered; signs+submits proof, forwards to verifier automatically |
| POST | `/verifier/verify` | (internal, or Member 2 directly) | `{jobId, proof, signature, evidence}` -> runs checks, signs attestation, settles |

### `POST /machine/jobs/:jobId/evidence` body (from Member 2)
```json
{
  "packageId": "A",
  "target": { "zone": "green", "x": 9, "y": 4 },
  "finalPosition": { "x": 9, "y": 4 },
  "delivered": true,
  "result": "success"
}
```
`result` is optional (`"success"` default, or `"fail"` if the robot itself reports failure).
This is the one contract Member 2 actually needs to match — everything past that point
(hashing, signing, on-chain calls, verification) is already handled.

Before attesting, the verifier confirms the request proof hashes to the proof stored on-chain
and independently recovers its EIP-712 signer against the machine's registered signer.
The proof signature must use the configured escrow domain (chain ID and JobEscrow address).

The `/jobs/:jobId` cache is a convenience for Member 4 — the chain itself
(`escrow.getJob`/`getJobState`) remains the source of truth and always will be, even if
this service restarts and loses its in-memory cache.

## Member 4 frontend integration

Use `http://localhost:4000` as the local service base URL (`VITE_MEMBER3_API_URL` in Vite).
The service currently enables CORS for browser requests. Keep the service URL configurable
so it can be changed for a deployed backend.

1. On dashboard load, call `GET /health` and display the returned machine and verifier
  addresses. Treat a non-2xx response or `{ ok: false }` as an unavailable service.
2. Create jobs through Member 1's escrow contract and keep the returned `jobId` with the
  job description. Use chain events and `escrow.getJob(jobId)` for customer-facing job
  state; the service cache is not persistent.
3. Once the job is `FUNDED`, call `POST /machine/jobs/{jobId}/accept` with no body. A
  successful response contains `acceptTx` and `startTx`; show their transaction links and
  advance the UI to accepted/executing. Call this once per funded job.
4. When the robot reports completion, have Member 2 call `POST /machine/jobs/{jobId}/evidence`.
  The frontend can then show `submitProofTx`, verification checks, `attestationTx`, and
  `settleTx` from the response. `verification.passed` indicates pass/fail; final chain
  state `PAID` or `REFUNDED` is authoritative.
5. For progress after the request, poll `GET /jobs/{jobId}` or listen to escrow events.
  The cache may be empty after a backend restart, so fall back to chain state and events.

Example browser call for accepting a job:

```ts
const baseUrl = import.meta.env.VITE_MEMBER3_API_URL || "http://localhost:4000";
const response = await fetch(`${baseUrl}/machine/jobs/${jobId}/accept`, { method: "POST" });
const result = await response.json();
if (!response.ok) throw new Error(result.error || "Machine could not accept the job");
```

The current evidence API receives both `target` and `finalPosition` from the caller. Until
job metadata is standardized across Members 2 and 4, use the target saved with the created
job and do not treat a caller-supplied target alone as proof of the customer's requested
destination. The local demo target is only a fixture.

The current service has no authentication and permissive CORS for local integration. Do not
expose it publicly as-is; production deployment needs an allowlisted origin and appropriate
request authentication/rate limiting.

## Splitting into two real services later

Right now the machine agent forwards proof+evidence to the verifier via an HTTP call to
itself (`/verifier/verify`). To run them as genuinely separate processes/machines, set
`VERIFIER_URL` to point at wherever the verifier's `/verifier/verify` route actually lives —
no code changes needed.

## Verified run (see below for the actual transcript)

Ran against a local Hardhat chain with Member 1's real compiled contracts:
- **Happy path**: accept → start → proof submitted → all 7 verifier checks pass →
  attestation submitted → `PaymentReleased` (100 native token → machine wallet). Final
  state: `PAID`.
- **Failure path**: same flow, but final position doesn't match target → `atTarget` and
  `delivered` checks fail → attestation submitted with `passed:false` → `JobRefunded`
  (reason `VERIFICATION_FAILED`, customer paid back). Final state: `REFUNDED`.

Both went through real transactions (`acceptJob`, `startExecution`, `submitProof`,
`submitAttestation`, `release`/`refund`) — this is the actual contract logic running,
not a mock.

## Error decoding

`JobEscrow` reverts with custom errors (`InvalidState`, `NonceAlreadyUsed`, `ProofExpired`,
`JobExpired`, `NotMachineOperator`, `InvalidMachineSignature`, `InvalidVerifierSignature`, ...).
`server.ts` already decodes these into readable `Name(args)` strings in every error response
instead of raw hex — check the `error` field in a 400 response first when something reverts.
