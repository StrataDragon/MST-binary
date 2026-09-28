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

---

## Two-Laptop Demo Setup

In a production demonstration, the system runs across two physical laptops on the same Wi-Fi / Local Area Network (LAN):
- **Laptop 1 (Host):** Runs EVM node (or MST Testnet), Backend-Service (:4000), and Customer Frontend (:5173).
- **Laptop 2 (Robot Kiosk):** Runs 3D Robot Simulator (:5174).

### 1. Environment Configurations

#### Laptop 1 (`Backend-service/.env` & `machinapay-frontend/.env`):
Find Laptop 1's LAN IP using `ipconfig` (e.g. `192.168.1.50`).

In `Backend-service/.env`:
```ini
PORT=4000
HOST=0.0.0.0
# The server automatically binds to 0.0.0.0 and logs LAN IPs at startup
```

In `machinapay-frontend/.env`:
```ini
VITE_RPC_URL=http://127.0.0.1:8545
# Or for MST Testnet:
# VITE_RPC_URL=https://testnetrpc.mstblockchain.com
# VITE_CHAIN_ID=91562037
VITE_BACKEND_URL=http://localhost:4000
```

#### Laptop 2 (`machinapay-simulator/.env`):
Replace `192.168.1.50` with Laptop 1's actual LAN IP:
```ini
VITE_MACHINE_ID=M-042
VITE_SIMULATOR_WS_URL=ws://192.168.1.50:4000/ws
VITE_MOCK_MODE=false
VITE_AUTO_RESET_DELAY_MS=6000
VITE_HEARTBEAT_INTERVAL_MS=5000
```

---

### 2. Startup Order
1. **[Laptop 1] Blockchain Node:** `npx hardhat node` (or ensure MST Testnet RPC is accessible).
2. **[Laptop 1] Deploy & Seed:** `npm run deploy:local && npm run seed:local`.
3. **[Laptop 1] Start Backend:** `cd Backend-service && npm run dev`.
   - Check startup logs for:
     ```
     MachinaPay Backend service listening on 0.0.0.0:4000
       [Two-Laptop Demo Network Info]
       Host LAN IPs: 192.168.1.50
     ```
   - Verify health from Laptop 2's browser: `http://192.168.1.50:4000/health`.
4. **[Laptop 2] Start Simulator:** `cd machinapay-simulator && npm run dev`.
   - Open simulator in browser. Status bar should show green dot: `CONNECTED`.
5. **[Laptop 1] Start Customer Frontend:** `cd machinapay-frontend && npm run dev`.
   - Connect BridgeKey wallet on MST Testnet (Chain ID `91562037`) or Localhost (`31337`).
   - Create and approve job. Robot on Laptop 2 runs automatically with zero manual clicks!

---

### 3. Troubleshooting Matrix

| Issue | Root Cause | Solution |
|---|---|---|
| **Job created in wallet, but Simulator stays IDLE** | 1. Simulator in Mock Mode.<br>2. `VITE_SIMULATOR_WS_URL` is pointing to `localhost` on Laptop 2.<br>3. Windows Firewall blocking port 4000 on Laptop 1. | 1. In `machinapay-simulator/.env`, ensure `VITE_MOCK_MODE=false`.<br>2. Set `VITE_SIMULATOR_WS_URL=ws://<LAPTOP_1_IP>:4000/ws`.<br>3. Allow inbound TCP port 4000 through Windows Defender Firewall on Laptop 1.<br>4. Check `http://<LAPTOP_1_IP>:4000/health` from Laptop 2. |
| **Metadata Rejected error (`metadataHash mismatch`)** | Frontend failed to reach `/api/jobs` before submitting on-chain transaction. | Ensure Backend-Service is running on port 4000. The frontend now strictly validates metadata registration before allowing wallet signature so jobs are never silently rejected. |
| **Wrong Chain in BridgeKey / Transactions Revert** | BridgeKey is connected to Ethereum Mainnet or Sepolia instead of MST Testnet (`91562037`) or Hardhat (`31337`). | In BridgeKey, approve the network switch prompt or select MST Testnet (RPC: `https://testnetrpc.mstblockchain.com`, Chain ID: `91562037`, Symbol: `MSTC`). |
| **WS Not Connecting (Red dot on Simulator)** | Backend not listening on all interfaces (`0.0.0.0`) or IP changed. | Backend now binds to `0.0.0.0`. Check Laptop 1's IP using `ipconfig` and ensure Laptop 2 can ping Laptop 1's LAN IP (`ping <LAPTOP_1_IP>`). Verify `VITE_SIMULATOR_WS_URL`. |
| **Machine ID mismatch** | Job was created for M-051 but simulator is running as M-042. | Check `VITE_MACHINE_ID` in simulator `.env`. Each simulator instance registers its own ID (`M-042` or `M-051`). |

