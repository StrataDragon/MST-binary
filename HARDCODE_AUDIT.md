# MachinaPay — Hardcode Audit & Config Refactoring Report

This audit documents every hardcoded value identified in `/machinapay`, `/machinapay/Backend-service`, and `/machinapay/machinapay-frontend`, the refactoring performed to eliminate baked-in literals, and the justifications for values intentionally maintained as safe defaults.

---

## 1. Machine Identifiers

| File | Original State | Refactored State | Notes & Justification |
|---|---|---|---|
| `machinapay-frontend/src/components/MachinePanel.tsx` (L20) | `const MACHINE_IDS = ["M-042"];` | Dynamically queries on-chain registry via `registry.getMachineIds()`, with fallback to `DEFAULT_MACHINE_IDS` from config. | In production, any machine registered on-chain will appear automatically in the UI without modifying frontend code. |
| `machinapay-frontend/src/lib/config.ts` | Did not exist | Added `DEFAULT_MACHINE_IDS` reading `VITE_MACHINE_IDS` env var, falling back to `["M-042"]`. | Allows operator override via `.env`. |
| `Backend-service/src/machineAgent.ts` (L19) | `process.env.MACHINE_ID \|\| "M-042"` | Retained `process.env.MACHINE_ID` with documented `"M-042"` fallback. | Properly documented in `Backend-service/.env.example`. |
| `scripts/seed-demo.ts` (L38) | `machineIdStr = process.env.MACHINE_ID \|\| "M-042"` | Explicitly drives registration from `process.env.MACHINE_ID \|\| "M-042"`. | Overridable for testing arbitrary machine identities. |

---

## 2. Contract Addresses, Chain IDs, RPC URLs & Verifier Address

| File | Original State | Refactored State | Notes & Justification |
|---|---|---|---|
| `machinapay-frontend/integration/machinapay.contracts.json` | Placeholder without contract ABIs | Replaced and synchronized with canonical generated contract file containing addresses, chainId, RPC, and full ABIs. | Ensures frontend communicates with the correct contract addresses and can encode/decode transactions. |
| `Backend-service/integration/machinapay.contracts.json` | Outdated address deployment (`0xDc64...`, `0x5FC8...`) | Synchronized by `scripts/deploy.ts` to canonical deployment (`0x5FbDB...`, `0xe7f17...`). | Eliminates mismatched deployment sync issues between backend and frontend. |
| `scripts/deploy.ts` (L14) | Hardcoded fallback `"0x5C024AF5878888a9F1d4E1aAfF6a928DEc812225"` | Resolves `process.env.VERIFIER_ADDRESS`, or derives from `process.env.VERIFIER_PRIVATE_KEY`, or uses Hardhat local account #3 on localhost. | Verifier address is never silently hardcoded; addresses match private keys automatically. |
| `machinapay-frontend/src/components/JobDetail.tsx` (L104) | Hardcoded zero address string `"0x0000000000000000000000000000000000000000"` | Replaced with `ZeroAddress` from `ethers`. | Standardized on ethers constant instead of literal address string. |
| `Backend-service/test/proofVerification.test.ts` (L7) | `"0x0000000000000000000000000000000000000001"` | Maintained as-is (justified). | Mock verifying contract address in pure unit test; does not touch live chain or deployment. |

---

## 3. Ports, URLs, and Service Endpoints

| File | Original State | Refactored State | Notes & Justification |
|---|---|---|---|
| `machinapay-frontend/vite.config.ts` (L6) | `server: { port: 5173 }` | `server: { port: Number(process.env.PORT \|\| env.VITE_PORT \|\| 5173) }` | Dev server port can now be changed via `PORT` or `VITE_PORT` in `.env`. |
| `machinapay-frontend/src/lib/config.ts` (L28) | Fallback `"http://localhost:4000"` | Maintained `VITE_MEMBER3_API_URL` override with documented fallback. | Documented in `machinapay-frontend/.env.example`. |
| `hardhat.config.ts` (L28) | Hardcoded `url: "http://127.0.0.1:8545"` | `url: process.env.LOCAL_RPC_URL \|\| "http://127.0.0.1:8545"` | Local RPC endpoint overridable via `LOCAL_RPC_URL`. |
| `scripts/deploy.ts` | Hardcoded localhost / MST RPC URLs | Driven by `process.env.RPC_URL`, `process.env.MST_RPC_URL`, and `process.env.LOCAL_RPC_URL`. | Fully configurable per environment. |

---

## 4. Demo & Test Fixtures Leaking into Application Paths

| File | Original State | Refactored State | Notes & Justification |
|---|---|---|---|
| `machinapay-frontend/src/components/JobDetail.tsx` (L49-55) | Hardcoded `{ packageId: "A", target: { zone: "green", x: 9, y: 4 }, delivered: true }` | Refactored to use `DEFAULT_EVIDENCE_TARGET` with clear architectural `TODO` comment for Member 2 robot sim integration. | Coordinates are now configurable via `VITE_DEFAULT_PACKAGE_ID`, `VITE_DEFAULT_TARGET_ZONE`, `VITE_DEFAULT_TARGET_X`, `VITE_DEFAULT_TARGET_Y`. |
| `machinapay-frontend/src/components/CreateJobForm.tsx` (L6-8) | Hardcoded initial state strings `"Move package A to green zone"`, `"100"`, `"60"` | Refactored to initialize from `DEFAULT_JOB_CONFIG` in `lib/config.ts`. | Defaults configurable via `VITE_DEFAULT_JOB_DESCRIPTION`, `VITE_DEFAULT_JOB_REWARD`, `VITE_DEFAULT_JOB_MINUTES`. |
| `Backend-service/scripts/demo-client.ts` (L33-38) | Hardcoded `{ packageId: "A", target: { zone: "green", x: 9, y: 4 } }` | Refactored to allow `process.env.DEMO_PACKAGE_ID`, `DEMO_TARGET_ZONE`, `DEMO_TARGET_X`, `DEMO_TARGET_Y`. | Enables parameterized demo runs from shell without code changes. |

---

## 5. Secrets & Private Keys

- All real and throwaway private keys are confined strictly to `.env` files (which are git-ignored).
- Added `.gitignore` to `Backend-service/` and `machinapay-frontend/` to prevent accidental credential leakage.
- Cleaned and updated all `.env.example` templates across all three modules to use placeholder values (`0xREPLACE_WITH_...` or empty).

---

## 6. Contract-Side Validation & Security Audit

Client-side validations (address formatting, balance checks, gas headroom, positive values) provide user experience feedback, but on-chain security requires that contracts independently reject invalid inputs. The table below details the audit of on-chain validation and reentrancy defenses:

| Validation Rule | Client-Side Check | Contract Enforcement | File & Line | Status / Finding |
|---|---|---|---|---|
| **Zero-Address Recipient** | Address regex `/^0x[a-fA-F0-9]{40}$/` | `MachineRegistry.sol:87` checks `wallet != address(0) && signer != address(0)`. In `JobEscrow.sol:228`, `job.machineWallet = m.wallet`. | `MachineRegistry.sol:87`, `JobEscrow.sol:180,228` | **Secure**. No machine can be registered or payout wallet set to zero address. |
| **Insufficient Deposit / Zero Reward** | Frontend requires `amount > 0` and verifies balance | `JobEscrow.sol:196` enforces `if (msg.value == 0) revert ZeroReward();`. Native reward is held atomically upon job creation. | `JobEscrow.sol:196` | **Secure**. Zero-value jobs cannot be created. |
| **Double-Release** | Release button disabled after completion | `JobEscrow.sol:317,323` checks `job.state != JobState.VERIFIED`. In line 323, `job.state = JobState.PAID;` is committed before the native transfer. Subsequent calls revert with `InvalidState(PAID)`. | `JobEscrow.sol:317,323` | **Secure**. Double release reverts immediately. |
| **Release Before Delivery** | Release action only active on verified jobs | `JobEscrow.sol:317` strictly requires `job.state == JobState.VERIFIED`. Transitions to `VERIFIED` only upon valid verifier attestation with `passed == true`. | `JobEscrow.sol:288,304,317` | **Secure**. Unverified jobs cannot be released. |
| **Reentrancy Protection on Settlement** | Sequential execution in UI | `JobEscrow.sol` inherits OpenZeppelin `ReentrancyGuard`. `release(jobId)` (L315) and `refund(jobId)` (L340) use `nonReentrant` modifier and follow Checks-Effects-Interactions (CEI). | `JobEscrow.sol:315,340` | **Secure & Tested**. Verified by test `enforces reentrancy protection: reverts if receiver attempts to re-enter during release` using `ReentrantReceiver` mock. |

