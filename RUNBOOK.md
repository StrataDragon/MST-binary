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

## MST Testnet Configuration
To target the MST Testnet (Chain ID `91562037`):
1. In root `.env`:
   ```ini
   RPC_URL=https://testnetrpc.mstblockchain.com
   CHAIN_ID=91562037
   ```
2. Deploy & Seed:
   ```powershell
   npm run deploy:mst
   npm run seed:mst
   ```
3. Run Backend-service with the testnet `.env`.
