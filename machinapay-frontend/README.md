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
| `VITE_DEFAULT_JOB_REWARD` | `1.0` | Default job reward in post form |
| `VITE_DEFAULT_JOB_MINUTES` | `60` | Default deadline in minutes in post form |
| `VITE_PRIVY_APP_ID` | `""` | Privy App ID from dashboard.privy.io (25-char alphanumeric starting with 'c') |
| `VITE_PRIVY_CLIENT_ID` | `""` | Optional Privy Client ID from dashboard.privy.io |

## Privy Embedded Wallet Setup

MachinaPay supports seamless web2-style login with email or Google, creating an automated embedded Ethereum wallet on the MST Testnet.

### 1. Dashboard Configuration
1. Go to [Privy Dashboard](https://dashboard.privy.io) and create an application (e.g., "MachinaPay").
2. Under **Settings > Basics**, copy your **App ID** (format: 25-character string starting with `c`).
3. Under **Authentication > Login Methods**, enable:
   - **Email** (with OTP verification)
   - **Google** (OAuth login)
4. Under **Embedded Wallets**:
   - Enable **Create on login** for Ethereum wallets.
   - Configure recovery method (Automatic / Password / Cloud backup as desired).
5. Under **Settings > Domains / Allowed Origins**:
   - Add `http://localhost:5173` (and your local network IP if testing on LAN/mobile, e.g. `http://192.168.x.x:5173`).

### 2. Local Environment Setup
1. Copy `.env.example` to `.env` in `machinapay-frontend/`:
   ```bash
   cp .env.example .env
   ```
2. Set your Privy credentials:
   ```ini
   VITE_PRIVY_APP_ID="your-25-char-privy-app-id"
   VITE_PRIVY_CLIENT_ID="your-privy-client-id" # optional
   ```
3. **Restart the Vite development server** so Vite loads the new environment variables:
   ```bash
   npm run dev
   ```

### 3. Faucet Funding
New Privy embedded wallets are provisioned with 0 `tMSTC`.
1. Once logged in, copy your Privy wallet address from the header or wallet details.
2. Visit the [MST Testnet Faucet](https://faucet.mstblockchain.com/) to receive free `tMSTC`.
3. The frontend displays a warning banner with quick-copy and direct faucet links whenever the connected wallet balance is 0.

---

## Privy Troubleshooting Table

| Symptom / Error | Root Cause | Fix |
|---|---|---|
| **Button disabled: "Privy not configured (set VITE_PRIVY_APP_ID)"** | `VITE_PRIVY_APP_ID` is missing, commented out, or contains placeholder/dummy value. | Enter your real 25-character App ID from `dashboard.privy.io` into `machinapay-frontend/.env` and restart `npm run dev`. |
| **"Privy failed to initialise, check browser console / allowed origins"** | Privy SDK failed to complete initialization within 8 seconds. Usually caused by domain origin mismatch or invalid credentials. | 1. Check DevTools console for Privy error messages.<br>2. Confirm `http://localhost:5173` is listed under Allowed Origins in the Privy dashboard.<br>3. Verify internet connectivity to `auth.privy.io`. |
| **"Invalid app ID" / console crash** | App ID is not a valid 25-character string matching Privy's cuid format. | Check the App ID copied from dashboard settings. It must begin with `c` and be exactly 25 characters long. |
| **Login popup blocked / closes immediately** | Browser popup blocker prevented Privy modal or OAuth popup from opening. | Allow popups for `localhost:5173` in your browser address bar. Privy uses popups for Google authentication. |
| **Wrong chain / transactions fail** | Embedded wallet not switched to MST Testnet (Chain ID `91562037`). | MachinaPay auto-switches chain to `91562037` upon connection. If prompted by Privy, approve the network addition/switch. |
| **Zero balance banner / "Insufficient balance" on job creation** | New embedded wallet has 0 `tMSTC`. | Click "MST Testnet Faucet" in the top notification banner or visit `https://faucet.mstblockchain.com/` and paste your Privy address. |

---

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
- Dual wallet architecture: Supports both BridgeKey / injected Web3 wallets and Privy embedded email/Google wallets.


