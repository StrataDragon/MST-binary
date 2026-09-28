# MachinaPay — Blockchain Module (Member 1)

> **Machines that work. Prove. Get paid.**
> Autonomous machine job marketplace on **MST Blockchain**: a customer locks native MST-testnet coin in an escrow contract, a registered machine executes the job and signs a proof, an independent verifier signs an attestation, and **the smart contract itself** releases payment (or refunds the customer).

This repo is the **blockchain module only** (contracts, tests, deploy/seed scripts, ABIs, integration docs). Robot simulation (Member 2), machine agent + verifier backend (Member 3) and frontend (Member 4) integrate through the ABIs and the interface documented below.

- Hand-off guide for **Member 3** (machine agent + verifier): [`docs/MEMBER3_MACHINE_AGENT_VERIFIER.md`](docs/MEMBER3_MACHINE_AGENT_VERIFIER.md)
- Hand-off guide for **Member 4** (frontend): [`docs/MEMBER4_FRONTEND.md`](docs/MEMBER4_FRONTEND.md)
- Runnable, tested reference code: [`integration/examples/`](integration/examples) and [`integration/signing.ts`](integration/signing.ts)

---

## 1. MST network facts (verify before deploying)

Verified on **24 Sep 2026** from MST-published material. Items marked ⚠️ could **not** be confirmed from an official MST page — check them yourself (Section 2 gives one-command checks).

| Item | Value | Source / status |
|---|---|---|
| Network name | **MST Testnet** | MST's own GitHub org (`Masterstroke-technosoft/dex-smart-contracts` README) |
| Chain ID | **91562037** (`0x5752035`) | same MST repo; matches other independent projects |
| RPC URL | `https://testnetrpc.mstblockchain.com` | same MST repo |
| WebSocket RPC | `wss://testnetrpc.mstblockchain.com` | same MST repo |
| Faucet | https://faucet.mstblockchain.com/ ("MST Testnet Faucet – Get Your MSTC") | linked from MST's project guide; page is JS-rendered |
| Explorer | `https://testnet.mstscan.com` | ⚠️ from community projects, not an official MST page |
| Native token symbol | mainnet chain (4646) lists **MSTC**; testnet shown as **tMSTC** by community projects, MST's DEX repo just says "MST" | ⚠️ sources disagree — confirm in MetaMask/faucet. Does not affect the contracts |
| Faucet amount / limits | unknown | ⚠️ if it gives < 100 coins, rehearse with a smaller `JOB_REWARD` or ask organisers for funds |
| EVM version supported | unknown | ⚠️ we compile for **`paris`** (no PUSH0/MCOPY/transient opcodes) so it runs on essentially any EVM chain |
| Official docs | `docs.mstblockchain.com` | blocks automated access; read it manually for anything I missed |

Do **not** confuse with MST **mainnet** (chain ID 4646). Everything here targets **testnet**.

### Native MSTC vs ERC-20 MockToken — decision: **native coin, no MockToken**
MST is an EVM chain whose native coin pays gas (MST's own DEX ships a `WMST` wrapper only because Uniswap-style contracts speak ERC-20). Escrowing the native coin with `payable` + `msg.value` is the simplest correct design: no approvals, no token contract, and the explorer shows the value moving. So there is **no `MockToken.sol`**. If a native transfer ever turned out not to work on MST, the smoke test in step 2 would show it immediately.

---

## 2. Quick start

Requirements: **Node.js 18, 20 or 22** (LTS), npm, Git. Windows: use PowerShell or Git Bash.

```bash
npm install            # installs Hardhat 2.29 + toolbox + OpenZeppelin 5.1.0
npm run compile
npm test               # 77 tests
npm run demo:local     # full happy + failure rehearsal on an in-process chain (no setup)
```

### Configure `.env` (never commit it)
```bash
copy .env.example .env      # Windows CMD  (PowerShell: Copy-Item .env.example .env ; Git Bash: cp)
```
Fill in at least `MST_PRIVATE_KEY` (a **throw-away** testnet wallet), `VERIFIER_ADDRESS` (Member 3's verifier address), `MACHINE_PRIVATE_KEY` (machine agent's wallet). Create wallets with any tool, or:
```bash
node -e "const {Wallet}=require('ethers');const w=Wallet.createRandom();console.log(w.address,w.privateKey)"
```
Then get testnet coins for the deployer/customer wallet at the faucet (and a few for the machine wallet).

### Deploy to MST testnet
```bash
npm run check:network    # RPC reachable? chain id 91562037? clock skew? balance?
npm run smoke:mst        # deploys a tiny Ping contract: proves MST accepts our bytecode + calls + events
npm run deploy:mst       # deploys MachineRegistry + JobEscrow, links them, writes deployments/ + integration/
npm run seed:mst         # registers M-042, funds its gas, creates a demo job
npx hardhat run scripts/demo-e2e.ts --network mst     # REAL end-to-end happy + failure run on MST
```
Outputs (commit these public files, **not** `.env`): `deployments/mst-testnet.json`, `deployments/deployment.json`, `deployments/demo.json`, `integration/machinapay.contracts.json` (addresses + ABI + EIP-712 domain), `integration/abi/*.abi.json`.

### Local development chain
```bash
npx hardhat node                 # terminal 1
npm run deploy:local             # terminal 2 (local roles: 0 deployer, 1 customer, 2 machine, 3 verifier)
npm run seed:local
```

### All scripts
| Command | What it does |
|---|---|
| `npm test` | 77 Hardhat tests (registry, escrow, signatures, replay, reentrancy, e2e) |
| `npm run coverage` | solidity-coverage report |
| `npm run check:network` | MST pre-flight (chain id, block time vs your clock, gas price, balance) |
| `npm run smoke:mst` | deploy + call a tiny contract on MST |
| `npm run deploy:local` / `deploy:mst` | deploy and write deployment files + ABIs |
| `npm run seed:local` / `seed:mst` | register machine, fund its gas, create demo job |
| `npm run demo:local` | self-contained rehearsal (deploys its own contracts) |
| `npm run export-abi` | rewrite `integration/abi/*` |

---

## 3. Architecture

```
CUSTOMER (MetaMask) ──createJob{value}──▶  JobEscrow  ◀── reads ──  MachineRegistry
                                              ▲   │                      ▲
MACHINE AGENT ── accept/start/submitProof ────┘   │ release / refund     │ recordJobResult
   (signs EIP-712 Proof with registered signer)   ▼                      │ (only JobEscrow)
VERIFIER ────── submitAttestation ──────────▶ pays machine wallet  or  customer
   (signs EIP-712 Attestation; fixed address)
```

### MachineRegistry — machine identity (source of truth)
Machine ID = `bytes32` (`"M-042"` → `ethers.encodeBytes32String("M-042")`, reversible, ≤31 chars). Per machine: `owner` (registrant, manages stake), `wallet` (payout + may send machine txs), `signer` (signs proofs), `stake`, `reputation`, `jobsCompleted`, `jobsFailed`, `active`, `registeredAt`. In the demo `wallet == signer`.
- Reputation starts at **100**, **+10** per paid job, **−20** per verifier-FAIL (floor 0). Only `JobEscrow` can change it (linked once via `setEscrow`).
- Stake = `msg.value` at registration (+ `topUpStake`); withdrawable by the owner only after deactivation. **No slashing** in the MVP — stake/reputation exist so the architecture extends.
- Registry admin (deployer) can deactivate any machine (kill switch). It **cannot** touch stake or escrowed funds.

### JobEscrow — the settlement engine
Rewards are the **native coin** (`msg.value`). Payment needs **both** a valid machine proof **and** a valid verifier attestation, enforced on-chain.

```
createJob{value}  ─▶ FUNDED            (CREATED=0 is reserved: creation+funding are one atomic tx, so no unfunded jobs)
acceptJob         FUNDED    ─▶ ACCEPTED         registered+active machine; payout wallet frozen here
startExecution    ACCEPTED  ─▶ EXECUTING
submitProof       EXECUTING ─▶ PROOF_SUBMITTED  machine EIP-712 signature checked vs registry signer
submitAttestation PROOF_SUBMITTED ─▶ VERIFIED   verifier EIP-712 signature, passed = true
                  PROOF_SUBMITTED, verdict=FAIL passed = false (refundable immediately, reputation −20)
release           VERIFIED  ─▶ PAID             pays the frozen machine wallet
refund            FUNDED/ACCEPTED/EXECUTING/PROOF_SUBMITTED ─▶ REFUNDED   pays the customer (rules below)
```

**Refund rules** (funds always go to the customer):
| State | Refund allowed when |
|---|---|
| FUNDED | customer cancels (any time), or deadline passed (anyone) |
| ACCEPTED / EXECUTING | deadline passed (anyone) |
| PROOF_SUBMITTED | verdict = FAIL (anyone, immediately) **or** no verdict by `deadline + 1h` (anyone) |
| VERIFIED, PAID, REFUNDED | **never** |

**Why the backend can't steal funds:** there is no `releaseFunds(address)`. `release()` and `refund()` take only a `jobId`, are callable by anyone, and the destination is fixed on-chain (machine wallet frozen at accept / job customer). The verifier can only *sign a verdict*; it can't choose a payee.

### Interface changes vs the project guide (deliberate)
| Guide | Implemented | Why |
|---|---|---|
| `createJob(jobId, metadataHash, reward)` | `createJob(jobId, metadataHash, duration, description)` **payable**; reward = `msg.value` | reward can't be lied about; atomic fund; duration is relative → no clock skew; description only emitted in the event |
| `acceptJob(jobId)` | `acceptJob(jobId, machineId)` | contract can't guess which machine the caller means |
| `submitProof(jobId, proofHash, signature)` | `submitProof(Proof, signature)` | contract *recomputes* the EIP-712 hash from the fields → the signed fields are what's stored |
| `submitAttestation(jobId, attestation)` | `submitAttestation(Attestation, signature)` | same |
| — | `startExecution(jobId)` | needed for the EXECUTING state |
| `registerMachine(machineId, publicKey)` | `registerMachine(machineId, wallet, signer)` payable | ECDSA verify uses an Ethereum **address**, not a raw public key |

### Signatures (EIP-712, domain = `{name:"MachinaPay JobEscrow", version:"1", chainId, verifyingContract}`)
```
Proof(bytes32 jobId, bytes32 machineId, uint8 result, uint64 timestamp, uint256 nonce, bytes32 evidenceHash)
Attestation(bytes32 jobId, bytes32 machineId, bytes32 proofHash, bool passed, uint64 timestamp)
```
- `result`: `1` success, `0` failed. `evidenceHash = keccak256(canonicalJson(evidence))` — evidence itself stays **off-chain**.
- `proofHash` (stored on-chain) = the EIP-712 digest of the proof; the attestation must reference exactly that.
- **Replay/abuse defences:** domain binds chain + contract; `jobId` in the digest (no cross-job reuse); per-machine `nonce` burned forever (`usedProofNonce`); one proof per job (state machine); timestamps must be ≤ +10 min in the future and ≤ 1 h old; OpenZeppelin `tryRecover` rejects malleable (high-s) signatures; proof/attestation must name the machine that accepted the job.

### Events (all indexed fields are the ones the feed filters on)
| Event | Args (**indexed**) |
|---|---|
| `MachineRegistered` | **machineId, owner, wallet**, signer, stake |
| `MachineDeactivated` | **machineId, by** |
| `MachineStakeUpdated` | **machineId**, oldStake, newStake |
| `MachineReputationUpdated` | **machineId**, oldReputation, newReputation, success |
| `JobCreated` | **jobId, customer**, reward, metadataHash, deadline, description |
| `JobFunded` | **jobId, customer**, amount |
| `JobAccepted` | **jobId, machineId, machineWallet** |
| `JobExecutionStarted` | **jobId, machineId** |
| `ProofSubmitted` | **jobId, machineId, proofHash**, evidenceHash, result, timestamp, nonce |
| `VerificationSubmitted` | **jobId, machineId, verifier**, passed, proofHash |
| `JobVerified` | **jobId, machineId**, proofHash |
| `PaymentReleased` | **jobId, machineId, machineWallet**, amount |
| `JobRefunded` | **jobId, customer**, amount, reason |

### Enums
| `JobState` | 0 CREATED*, 1 FUNDED, 2 ACCEPTED, 3 EXECUTING, 4 PROOF_SUBMITTED, 5 VERIFIED, 6 PAID, 7 REFUNDED |
|---|---|
| `Verdict` | 0 NONE, 1 PASS, 2 FAIL |
| `RefundReason` | 0 CUSTOMER_CANCELLED, 1 EXPIRED, 2 VERIFICATION_FAILED |
| proof `result` | 0 FAILED, 1 SUCCESS |

\* `CREATED` is reserved/unused because creation and funding are atomic. **A FAIL verdict does not change `state`** — the job stays `PROOF_SUBMITTED` with `verdict == 2` until `refund()` moves it to `REFUNDED`. UIs should show "Rejected" when `state == 4 && verdict == 2`.

### Public read API
`JobEscrow`: `getJob(jobId)`, `getJobState(jobId)`, `jobExists(jobId)`, `jobCount()`, `getJobIds(offset, limit)`, `totalLocked()`, `verifier()`, `registry()`, `usedProofNonce(machineId, nonce)`, `hashProof(proof)`, `hashAttestation(att)`, `eip712Domain()`.
`MachineRegistry`: `isRegistered(id)`, `isActive(id)`, `getMachine(id)`, `walletOf(id)`, `signerOf(id)`, `machineCount()`, `getMachineIds()`, `minStake()`, `escrow()`.
`getJob`/`getMachine` **revert** for unknown ids → call `jobExists` / `isRegistered` first.

### Custom errors (for UI messages)
`InvalidState(state)`, `JobNotFound`, `JobAlreadyExists`, `ZeroReward`, `InvalidDuration`, `JobExpired`, `MachineNotRegistered`, `MachineInactive`, `NotMachineOperator`, `WrongMachine`, `ProofTimestampInvalid`, `ProofExpired`, `NonceAlreadyUsed`, `InvalidMachineSignature`, `InvalidVerifierSignature`, `AttestationExpired`, `ProofHashMismatch`, `AttestationContradictsProof`, `NotRefundable`, `TransferFailed`. Decode with `contract.interface.parseError(err.data)`.

---

## 4. Frontend Integration (Member 4) — summary
Full guide with copy-paste code: [`docs/MEMBER4_FRONTEND.md`](docs/MEMBER4_FRONTEND.md). Files to import: `integration/machinapay.contracts.json` (addresses, ABI, chainId, EIP-712 domain).

```ts
import { BrowserProvider, Contract, parseEther, formatEther } from "ethers";
import cfg from "./machinapay.contracts.json";

// connect wallet + make sure MetaMask is on MST testnet
const provider = new BrowserProvider((window as any).ethereum);
await provider.send("eth_requestAccounts", []);
await provider.send("wallet_addEthereumChain", [{
  chainId: "0x5752035", chainName: "MST Testnet",
  rpcUrls: ["https://testnetrpc.mstblockchain.com"],
  nativeCurrency: { name: "MSTC", symbol: "tMSTC", decimals: 18 },   // confirm symbol
  blockExplorerUrls: ["https://testnet.mstscan.com"],
}]);
const signer = await provider.getSigner();
const escrow = new Contract(cfg.addresses.JobEscrow, cfg.abi.JobEscrow, signer);
const registry = new Contract(cfg.addresses.MachineRegistry, cfg.abi.MachineRegistry, provider);

// read machine
const id = encodeBytes32String("M-042");
if (await registry.isRegistered(id)) { const m = await registry.getMachine(id); /* m.wallet, m.reputation, m.stake */ }

// create job + lock 100 (reward is msg.value)
const jobId = keccak256(toUtf8Bytes(crypto.randomUUID()));
const desc = "Move package A to green zone";
await (await escrow.createJob(jobId, keccak256(toUtf8Bytes(desc)), 3600, desc, { value: parseEther("100") })).wait();

// read job / balance / live events
const job = await escrow.getJob(jobId);                 // job.state (number), job.verdict, job.reward ...
const bal = await provider.getBalance(m.wallet);
escrow.on("PaymentReleased", (jobId, machineId, wallet, amount) => { /* update feed */ });
```
Accept/start/proof/attestation are **not** called from the browser in the demo — Member 3's agents do that. The UI creates jobs, refunds/cancels, and reads state/events.

## 5. Machine Agent / Verifier Integration (Member 3) — summary
Full guide: [`docs/MEMBER3_MACHINE_AGENT_VERIFIER.md`](docs/MEMBER3_MACHINE_AGENT_VERIFIER.md). Copy `integration/signing.ts` (needs only `ethers` v6). Tested reference implementations: `integration/examples/machine-agent.ts` and `verifier.ts`.

```ts
// MACHINE: accept -> start -> sign -> submit
await (await escrow.acceptJob(jobId, machineId)).wait();
await (await escrow.startExecution(jobId)).wait();
const proof = { jobId, machineId, result: 1, timestamp: (await provider.getBlock("latest"))!.timestamp,
                nonce: randomNonce(), evidenceHash: hashEvidence(evidence) };
const sig = await signProof(machineWallet, escrowDomain(chainId, escrowAddress), proof);
await (await escrow.submitProof(proof, sig)).wait();

// VERIFIER: read job, check evidence, attest, settle
const job = await escrow.getJob(jobId);                                   // job.proofHash, job.evidenceHash
const passed = hashEvidence(evidence) === job.evidenceHash && /* position == target ... */ true;
const att = { jobId, machineId: job.machineId, proofHash: job.proofHash, passed, timestamp: block.timestamp };
await (await escrow.submitAttestation(att, await signAttestation(verifierWallet, domain, att))).wait();
await (await (passed ? escrow.release(jobId) : escrow.refund(jobId))).wait();
```
⚠️ **ethers v6 gotcha:** use `new JsonRpcProvider(url, chainId, { cacheTimeout: -1, staticNetwork: true })`; otherwise two quick transactions from the same wallet can fail with *"nonce has already been used"* (found and fixed while testing the examples).

---

## 6. Security notes
Implemented: EIP-712 + `tryRecover` (no malleability), domain separation, per-machine nonces, timestamp TTL/skew, state checks on every transition, checks-effects-interactions **and** `nonReentrant` on `release`/`refund`/`withdrawStake`, fixed payees, exact-value accounting (`totalLocked == balance`), no receive/fallback (no accidental deposits), custom errors, zero-address/zero-id checks, no privileged fund movement. Mutation-tested: deliberately breaking the verifier check, reentrancy ordering, and nonce check each makes tests fail.

**Known limits (MVP, be honest in Q&A):**
1. **One trusted verifier** (address fixed at deployment; redeploy to rotate). Production: multiple staked verifiers + threshold + slashing. The verifier can be *wrong* but can never redirect funds.
2. **Not audited.** Testnet/hackathon use only.
3. **Machine `wallet` must be able to receive coin** (EOA in the demo). A contract payee that reverts would block `release`; a customer contract that reverts blocks its own refund.
4. **Permissionless registration:** anyone could register "M-042" first → register your demo machine right after deploying.
5. **Liveness:** if the verifier never attests, funds sit until `deadline + 1h`, then anyone can refund. A very slow verifier can lose the race to a refund (by design; keep `JOB_DURATION_SECONDS` generous).
6. Registry admin key can deactivate machines (not move funds). Machine reputation isn't reduced for pure timeouts.
7. Machine timestamps come from the agent's clock: use **chain block time** (`getBlock("latest").timestamp`) to be immune to laptop clock drift.
8. Compiler pinned to `evm: paris` and OpenZeppelin **5.1.0** on purpose: newer OZ versions use the `mcopy` opcode (Cancun), which MST may not support. Switch only after `smoke:mst` passes on a Cancun build.

**Secrets:** `.env` is git-ignored; only `.env.example` is committed. Use separate throw-away testnet wallets for deployer/customer, machine and verifier. Deployment JSON files contain public addresses/hashes only. If a key ever lands in git, treat it as burned and rotate it.

---

## 7. Repository layout
```
contracts/           MachineRegistry.sol, JobEscrow.sol, interfaces/IMachineRegistry.sol, mocks/ (test-only)
test/                MachineRegistry.test.ts, JobEscrow.test.ts
scripts/             deploy.ts seed-demo.ts demo-e2e.ts check-network.ts smoke-deploy.ts export-abi.ts lib/
integration/         signing.ts (shared), abi/, machinapay.contracts.json (generated), examples/
deployments/         mst-testnet.json, deployment.json, demo.json (generated; public data only)
docs/                MEMBER3_…md, MEMBER4_…md
```

## 8. Deployed addresses
Filled in by `npm run deploy:mst` → see `deployments/mst-testnet.json`. *(Not deployed yet — deployment requires your funded testnet key; see Section 2.)*

| Contract | Address | Explorer |
|---|---|---|
| MachineRegistry | _pending_ | |
| JobEscrow | _pending_ | |
| Verifier | _your VERIFIER_ADDRESS_ | |
