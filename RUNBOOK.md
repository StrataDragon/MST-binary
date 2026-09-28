# MachinaPay End-to-End Runbook

This runbook provides the exact PowerShell commands to run MachinaPay locally or against the MST Testnet, connecting the 3D JCB Robot Simulator, Backend-Service (Machine Agent + Multi-Verifier Relay), Smart Contracts, and the Customer Frontend.

---

## Architecture Overview

```
 Customer (Frontend / MetaMask)
           │
           ▼  (createJob {value: reward})
      [JobEscrow.sol] ─── On-Chain Escrow (Hardhat or MST Testnet)
           │
           ▲  (Event: JobCreated)
   [Backend-Service :4000]
     ├── Chain Listener (Reconciliation + Block Polling)
     ├── Machine Agent (acceptJob -> startExecution)
     │         │
     │         ▼  (START_JOB over WebSocket ws://localhost:4000/ws)
     │   [3D Robot Simulator :5173] (Auto-executes: no user clicks needed)
     │         │
     │         ▼  (JOB_COMPLETED / JOB_FAILED over WebSocket)
     ├── Machine Signer: Signs EIP-712 Proof -> calls submitProof
     └── Multi-Verifier Consensus (Alpha, Beta, Gamma quorum):
           Signs EIP-712 Attestation -> calls submitAttestation
           ├── Success: calls release(jobId) -> pays machine wallet
           └── Failure: calls refund(jobId) -> refunds customer
```

---

## Ports & Services Summary

| Component | Directory | Port / Transport | Role |
|---|---|---|---|
| **Hardhat Node** | `./` | `http://127.0.0.1:8545` | Local EVM blockchain |
| **Backend-Service** | `./Backend-service` | `http://localhost:4000`<br>`ws://localhost:4000/ws`<br>`ws://localhost:4000/api/transactions/ws` | Machine agent + verifier + simulator relay |
| **Robot Simulator** | `./machinapay-simulator` | `http://localhost:5174` (or Vite default) | 3D kinematics simulator (Member 2) |
| **Frontend** | `./machinapay-frontend` | `http://localhost:5173` | Customer portal & Typology Radar (Member 4) |

---

## Step-by-Step Execution Guide (Windows / PowerShell)

Run each step in a dedicated PowerShell terminal from the workspace root:
`c:\Users\Kishan DV\OneDrive\Desktop\MST\machinapay`

### Step 1: Start the Local Hardhat Node (Terminal 1)
```powershell
cd "c:\Users\Kishan DV\OneDrive\Desktop\MST\machinapay"
npx hardhat node
```
*Leave this running. It generates 20 pre-funded test accounts.*

---

### Step 2: Deploy Contracts & Seed Demo (Terminal 2)
```powershell
cd "c:\Users\Kishan DV\OneDrive\Desktop\MST\machinapay"

# 1. Deploy contracts to local node
npm run deploy:local

# 2. Register Machine M-042 and fund gas
npm run seed:local
```
Expected output:
```
MachineRegistry deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
JobEscrow deployed to: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
Registered machine M-042 with stake 0.01
Funded machine wallet 0xcB00D7fF471334F2EeD249dF741C6E6c1B07aaf1 with 10 ETH
```

---

### Step 3: Start the Backend-Service (Terminal 2)
```powershell
cd "c:\Users\Kishan DV\OneDrive\Desktop\MST\machinapay\Backend-service"
npm run dev
```
Expected output:
```
MachinaPay Backend service listening on :4000
  machine wallet:  0xcB00D7fF471334F2EeD249dF741C6E6c1B07aaf1 (M-042)
  verifier wallet: 0x5C024AF5878888a9F1d4E1aAfF6a928DEc812225
  HTTP API:        http://localhost:4000
  Simulator WS:    ws://localhost:4000/ws
[chain-listener] Initializing chain listener with reconciliation & block polling…
[chain-listener] Event poller active.
```

---

### Step 4: Start the 3D Robot Simulator (Terminal 3)
Ensure `.env` in `machinapay-simulator` has:
```ini
VITE_MACHINE_ID=M-042
VITE_SIMULATOR_WS_URL=ws://localhost:4000/ws
VITE_MOCK_MODE=false
VITE_AUTO_RESET_DELAY_MS=6000
VITE_HEARTBEAT_INTERVAL_MS=5000
```
Then start the simulator:
```powershell
cd "c:\Users\Kishan DV\OneDrive\Desktop\MST\machinapay\machinapay-simulator"
npm run dev
```
Open `http://localhost:5174` in your browser.
TopBar will show:
- **MACHINE:** `M-042`
- **CONNECTION:** `CONNECTED` (green dot)
- **BLOCKCHAIN:** `NOT CONTROLLED HERE` (until a job is active)

---

### Step 5: Start the Frontend Portal (Terminal 4)
```powershell
cd "c:\Users\Kishan DV\OneDrive\Desktop\MST\machinapay\machinapay-frontend"
npm run dev
```
Open `http://localhost:5173`. Connect MetaMask to Hardhat Local (Chain ID `31337`).

---

### Step 6: Run Automated End-to-End Verification (Terminal 5)
```powershell
cd "c:\Users\Kishan DV\OneDrive\Desktop\MST\machinapay"
npm run e2e
```
This tests:
1. **Happy Path:** Registers metadata via `POST /api/jobs`, creates job on-chain with 5.0 ETH reward. The backend accepts and starts execution on-chain, relays `START_JOB` over WebSocket. The robot executes automatically with no clicks, reports `JOB_COMPLETED`. The backend signs the EIP-712 proof, multi-verifier passes consensus, attestation is submitted, payment of 5.0 ETH is released to the machine wallet, and the simulator displays `PAID` with tx hash.
2. **Failure Path:** Sets `simulateFailure: true`. The robot reports `JOB_FAILED`. The backend submits a proof with result 0, verifier attests `passed: false`, and customer receives a 100% full refund.
3. **Security Test:** Submits a job with a forged/unregistered `metadataHash`. The backend detects the mismatch, rejects the job, and refuses to dispatch to the robot.

---

## Offline Mock Mode (For Testing without Backend / Blockchain)
To run the simulator completely standalone and offline:
In `machinapay-simulator/.env`:
```ini
VITE_MOCK_MODE=true
```
Run `npm run dev`. You can use the on-screen "SEND TEST JOB" buttons to trigger all 4 task types (`MOVE_OBJECT`, `PICK_AND_PLACE`, `LOAD_AND_DUMP`, `DELIVERY`).

---

## MST Testnet Single-Laptop Demo

This section details the exact setup, environment variables, startup order, and troubleshooting procedures for running the entire autonomous commerce flow on **MST Testnet (Chain ID `91562037`)** using the BridgeKey wallet on a single computer.

### 1. Environment Configurations

#### Root `.env` (`c:\Users\Kishan DV\OneDrive\Desktop\MST\machinapay\.env`):
```ini
MST_RPC_URL=https://testnetrpc.mstblockchain.com
MST_CHAIN_ID=91562037
MST_EXPLORER_URL=https://testnet.mstscan.com

# Deployer / Seed wallet (must have >= 0.05 tMSTC for deployment & gas funding)
MST_PRIVATE_KEY=0x...

# Machine M-042 (Wallet: 0xcB00D7fF471334F2EeD249dF741C6E6c1B07aaf1)
MACHINE_ID=M-042
MACHINE_PRIVATE_KEY=0x...

# Machine M-051 (Arm Picker)
MACHINE_051_ID=M-051
MACHINE_051_PRIVATE_KEY=0x...

# Verifier Wallet (0x5C024AF5878888a9F1d4E1aAfF6a928DEc812225)
VERIFIER_ADDRESS=0x5C024AF5878888a9F1d4E1aAfF6a928DEc812225
VERIFIER_PRIVATE_KEY=0x...

# Pricing & Seed parameters
MIN_STAKE=0
MACHINE_STAKE=0.01
JOB_REWARD=1.0
PRICE_SCALE=0.1
```

#### Backend-Service `.env` (`Backend-service/.env`):
```ini
PORT=4000
SELF_URL=http://localhost:4000
DEV_ENDPOINTS=true

# Contract addresses are loaded automatically from integration/machinapay.contracts.json
CONTRACTS_JSON=./integration/machinapay.contracts.json
RPC_URL=https://testnetrpc.mstblockchain.com

MACHINE_ID=M-042
MACHINE_PRIVATE_KEY=0x...

VERIFIER_PRIVATE_KEY=0x...
```

#### Simulator `.env` (`machinapay-simulator/.env`):
```ini
VITE_MACHINE_ID=M-042
VITE_SIMULATOR_WS_URL=ws://localhost:4000/ws
VITE_MOCK_MODE=false
VITE_AUTO_RESET_DELAY_MS=6000
VITE_HEARTBEAT_INTERVAL_MS=5000
```

#### Frontend `.env` (`machinapay-frontend/.env`):
```ini
VITE_MEMBER3_API_URL=http://localhost:4000
VITE_SIMULATOR_URL=http://localhost:5174
VITE_NETWORK_MODE=mst
VITE_MST_CHAIN_ID=91562037
VITE_MST_RPC_URL=https://testnetrpc.mstblockchain.com
VITE_MST_EXPLORER_URL=https://testnet.mstscan.com
VITE_PORT=5173
VITE_MACHINE_IDS=M-042,M-051
VITE_DEFAULT_JOB_DESCRIPTION=Move package A to green zone
VITE_DEFAULT_JOB_REWARD=1.0
VITE_DEFAULT_JOB_MINUTES=60
```

---

### 2. Startup Order (Single-Laptop)

Open 3 PowerShell terminals in the workspace:

#### Step 1: Run Doctor & Start Backend (Terminal 1)
```powershell
cd "c:\Users\Kishan DV\OneDrive\Desktop\MST\machinapay\Backend-service"
npm run doctor   # Verifies RPC, contracts, M-042, balances, verifier match, port, etc.
npm run dev      # Starts Express & WebSocket on 0.0.0.0:4000
```
Expected output:
```
=======================================================
             MACHINAPAY SYSTEM DOCTOR                 
=======================================================
[PASS] RPC & Chain ID (91562037)
[PASS] Contracts On-Chain Code
[PASS] Machine M-042 Registration (ACTIVE)
[PASS] Wallet Balances for Gas (Machine & Verifier >= 0.005 tMSTC)
[PASS] Verifier Address Match (0x5C024AF5...)
[PASS] Metadata Store Writable
[PASS] Port 4000 Listening
=======================================================
```

#### Step 2: Start 3D Robot Simulator (Terminal 2)
```powershell
cd "c:\Users\Kishan DV\OneDrive\Desktop\MST\machinapay\machinapay-simulator"
npm run dev
```
Open `http://localhost:5174`. The header must show:
- `MACHINE: M-042`
- `CONNECTION: LIVE — linked to backend` (green dot)
- In the browser console:
  `[simulator] Startup config: wsUrl=ws://localhost:4000/ws, machineId=M-042, mockMode=false`
  `[simulator] Backend acknowledged MACHINE_ONLINE for M-042`

#### Step 3: Start Customer Frontend (Terminal 3)
```powershell
cd "c:\Users\Kishan DV\OneDrive\Desktop\MST\machinapay\machinapay-frontend"
npm run dev
```
Open `http://localhost:5173`.
1. BridgeKey will detect MST Testnet (`91562037`).
2. Go to **Wallet Map** or **Marketplace** or **Post a job**.
3. Notice default reward is `1.0 tMSTC` (safe for standard testnet balances).
4. Machine M-042 node badge shows `3D simulator online - idle` (or `offline` / `Backend unreachable` with clear distinction).
5. Click **Lock & Post Job** -> BridgeKey popup opens -> approve transaction.
6. Chain listener detects `JobCreated`, verifies off-chain metadata, accepts on-chain, and sends `START_JOB` to the 3D simulator.
7. Simulator executes the physical kinematics on-screen (no manual clicks).
8. On completion, simulator sends `JOB_COMPLETED`, backend submits EIP-712 proof, verifier attests consensus, and escrow releases payment to `0xcB00D7fF...`.

---

### 3. Comprehensive Troubleshooting Table

| Symptom / Issue | Root Cause | Diagnosis | Fix |
|---|---|---|---|
| **"Insufficient MSTC in wallet to pay reward and network gas"** | Default reward was 10 or 100 tMSTC, exceeding wallet balance (~9.8 tMSTC). | Pre-flight check calculates `rewardWei + estGasCost > userBalance`. | Click the new **"⚡ Use max safe reward"** button. Default reward is now configured to `1.0 tMSTC`. |
| **"3D simulator offline" while simulator tab shows CONNECTED** | 1. Simulator running in `VITE_MOCK_MODE=true`.<br>2. WebSocket URL wrong (`ws://localhost:3000` instead of `4000`).<br>3. Backend `/api/simulator/status` not polled. | Check browser console at `http://localhost:5174`: look for `[simulator] Startup config`. | Set `VITE_MOCK_MODE=false` in `machinapay-simulator/.env`. Verify TopBar shows `LIVE — linked to backend`. Frontend now distinguishes `Backend unreachable` from `3D simulator offline`. |
| **Job rejected with "metadataHash does not match registered canonical metadata"** | On-chain `createJob` was sent with a metadata hash that was never registered at `POST /api/jobs`. | Backend logs: `REJECTED job: metadataHash does not match`. | Ensure Backend-service is running on port 4000 before posting a job. All three frontend forms now pre-register metadata and verify receipt before prompting the wallet. |
| **Wrong chain / transactions revert silently** | BridgeKey or provider connected to Hardhat (`31337`) or Mainnet instead of MST Testnet (`91562037`). | Check `window.ethereum.chainId` in DevTools console. | In BridgeKey, switch network to MST Testnet (`https://testnetrpc.mstblockchain.com`, Chain ID `91562037`). Frontend validates `chainId == 91562037` before sending transactions. |
| **Machine M-042 node inactive / unassigned** | Machine not registered in `MachineRegistry.sol` on MST Testnet. | Run `npm run doctor` in `Backend-service`. Check `[FAIL] Machine M-042 Registration`. | Run `npm run seed:mst` from repo root to register M-042 and M-051 with initial stake on-chain. |
| **chainListener stops processing events / RPC query filter errors** | `lastProcessedBlock` initialized to 0 on MST Testnet (5.7M blocks), triggering RPC query range limits. | Backend logs: silent failure or `range exceeds limit`. | Fixed in `chainListener.ts`: initialization now starts at `currentBlock - 50` and automatically chunks block queries into max 1,000 block windows. |
| **Simulator link needs verification without spending testnet coins** | Verifying WS & kinematics separate from on-chain transactions. | Need isolated simulator dispatch test. | Use the dev-only isolation endpoint: `Invoke-RestMethod -Uri "http://localhost:4000/api/dev/dispatch" -Method Post -ContentType "application/json" -Body '{"machineId":"M-042"}'`. Dispatches directly to simulator with zero escrow interaction. |

---

## 4. Privy Embedded Wallet Setup & Troubleshooting

MachinaPay provides web2 onboarding via Privy, letting users sign in with Email (OTP) or Google and automatically provisioning an embedded wallet on the MST Testnet (`chainId 91562037`).

### Setup Steps
1. **Create App in Privy Dashboard**:
   - Visit [dashboard.privy.io](https://dashboard.privy.io) and create an app (e.g. `MachinaPay`).
   - Go to **Settings > Basics** and copy the **App ID** (25-character cuid starting with `c`).
2. **Enable Authentication & Embedded Wallets**:
   - In **Authentication > Login Methods**, enable **Email** and **Google**.
   - In **Embedded Wallets**, turn ON **Create on login** for Ethereum wallets.
3. **Configure Allowed Origins**:
   - In **Settings > Domains**, add:
     - `http://localhost:5173`
     - Any local development IP (e.g. `http://192.168.x.x:5173` if testing on local network).
4. **Configure Local Environment**:
   - In `machinapay-frontend/.env`, set:
     ```ini
     VITE_PRIVY_APP_ID="your-25-char-privy-app-id"
     # Optional:
     VITE_PRIVY_CLIENT_ID="your-privy-client-id"
     ```
   - **Restart Vite**: Restart `npm run dev` in `machinapay-frontend` to reload env variables.
5. **Fund the Embedded Wallet**:
   - Copy the embedded wallet address from the frontend header.
   - Go to the [MST Testnet Faucet](https://faucet.mstblockchain.com/) and request `tMSTC`.

### Privy Troubleshooting Table

| Symptom / Issue | Root Cause | Diagnosis | Fix |
|---|---|---|---|
| **Button disabled: "Privy not configured (set VITE_PRIVY_APP_ID)"** | `VITE_PRIVY_APP_ID` is missing, commented out, or contains placeholder/dummy value. | Check `ConnectWallet.tsx` badge tooltip. | Copy the real 25-character App ID from `dashboard.privy.io` into `machinapay-frontend/.env` and restart Vite (`npm run dev`). |
| **"Privy failed to initialise, check browser console / allowed origins"** | Privy SDK failed to initialize within 8 seconds. Typically due to domain origin mismatch or invalid credentials. | Open DevTools console (`F12`); look for Privy 401 or origin errors. | Add `http://localhost:5173` to Allowed Origins in Privy Dashboard settings. Verify internet access to `auth.privy.io`. |
| **"Invalid app ID" / console crash** | App ID does not match Privy's 25-character cuid specification (`/^c[a-z0-9]{24}$/i`). | Check character count and format of `VITE_PRIVY_APP_ID`. | Paste the exact 25-character ID provided in the Privy dashboard. Dummy/short IDs are safely trapped by `isValidPrivyAppId`. |
| **Login popup blocked** | Browser blocked the OAuth or login popup window. | Browser address bar shows "Pop-up blocked" icon. | Click the icon in the address bar and select "Always allow pop-ups from http://localhost:5173". |
| **Wrong chain / transactions fail** | Embedded wallet is on Mainnet/Sepolia instead of MST Testnet (`91562037`). | Check wallet network modal in Privy. | The frontend automatically triggers `wallet.switchChain(91562037)`. If prompted, approve the switch to MST Testnet. |
| **Zero balance banner / "Insufficient balance" on job creation** | A freshly provisioned embedded wallet starts with 0 `tMSTC`. | Frontend displays yellow banner: `⚠️ Connected wallet has 0 tMSTC`. | Click "MST Testnet Faucet" in the banner or visit `https://faucet.mstblockchain.com/` to request testnet coins. |


