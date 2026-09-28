# MachinaPay — Frontend (Member 4)

Vite + React + TypeScript + Tailwind + ethers v6. Reads chain state directly
(no wallet required) and writes via MetaMask; talks to Member 3's backend for
the machine-agent / verifier actions.

## Before you run this — 3 things must line up

1. **One `machinapay.contracts.json`.** Replace
   `integration/machinapay.contracts.json` in this repo with the *exact* file
   Member 1's `npm run deploy:local` (or `deploy:mst`) just produced. It must
   be **byte-for-byte the same file** Member 3's backend is using
   (`Backend-service/integration/machinapay.contracts.json`). If those two
   differ, jobs you create here will look "stuck" to the backend and vice
   versa — check this first if anything seems broken.
2. **Backend running.** `cd Backend-service && npm run dev` (default
   `http://localhost:4000`). Set `VITE_MEMBER3_API_URL` in `.env` if it's
   elsewhere.
3. **Chain running + MetaMask on it.** `npx hardhat node` (local) or the MST
   testnet RPC, matching whatever's in `machinapay.contracts.json`.

## Run

```bash
npm install
cp .env.example .env   # edit if backend isn't on localhost:4000
npm run dev
```

## What's wired up

- **MachinePanel** — reads `MachineRegistry.getMachine("M-042")` + wallet
  balance directly from chain, polls every 8s.
- **CreateJobForm** — calls `JobEscrow.createJob(...)` from the customer's
  connected wallet (`payable`, locks the reward).
- **JobList / JobDetail** — reads `JobEscrow.getJob(id)`, maps
  `(state, verdict)` to a human status using the table from
  `docs/MEMBER4_FRONTEND.md`. Buttons drive the demo flow:
  - "Machine: accept + start" → `POST /machine/jobs/:id/accept` (Member 3)
  - "Robot: delivered / missed target" → `POST /machine/jobs/:id/evidence`
    (stands in for Member 2's robot until it's wired up — sends fixed
    target/position payloads matching the backend's demo fixture)
  - "Request refund" → `JobEscrow.refund(id)` directly from the wallet
- **EventFeed** — subscribes to all `JobEscrow` events live, plus backfills
  the last ~3000 blocks on load.

## Configuration (.env)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_MEMBER3_API_URL` | `http://localhost:4000` | Base URL of Member 3 machine agent & verifier service |
| `VITE_PORT` | `5173` | Frontend Vite development server port |
| `VITE_MACHINE_IDS` | `M-042` | Comma-separated machine IDs to monitor (MachinePanel queries on-chain registry dynamically) |
| `VITE_DEFAULT_PACKAGE_ID` | `A` | Default package ID for robot sim evidence fixture |
| `VITE_DEFAULT_TARGET_ZONE` | `green` | Default target zone for robot sim evidence fixture |
| `VITE_DEFAULT_TARGET_X` | `9` | Default target X coordinate for evidence fixture |
| `VITE_DEFAULT_TARGET_Y` | `4` | Default target Y coordinate for evidence fixture |
| `VITE_DEFAULT_JOB_DESCRIPTION` | `Move package A to green zone` | Default job description in post form |
| `VITE_DEFAULT_JOB_REWARD` | `100` | Default job reward in post form |
| `VITE_DEFAULT_JOB_MINUTES` | `60` | Default deadline in minutes in post form |

## Wiring in Member 2's robot simulation

Right now "Robot: delivered" sends configurable `DEFAULT_EVIDENCE_TARGET` coordinates. Once Member 2's
canvas sim exists, replace the two `handleReportEvidence` calls in
`JobDetail.tsx` with the sim's actual output (`packageId`, `target`,
`finalPosition`, `delivered`) — the shape already matches what
`machineApi.submitEvidence` expects.

## Features & Dynamic Capabilities

- **Dynamic Machine Discovery**: `MachinePanel.tsx` queries `registry.getMachineIds()` from the smart contract, automatically discovering all registered machines without requiring code changes.
- Direct on-chain escrow event monitoring.
- Interactive job creation, machine acceptance, simulated evidence submission, and refunds.

