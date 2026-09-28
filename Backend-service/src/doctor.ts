import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import * as net from "net";
import { formatEther, encodeBytes32String } from "ethers";
import { cfg, provider, RPC_URL, getRegistry, getEscrow } from "./config";
import { getMachineAddress } from "./machineAgent";
import { getVerifierAddress } from "./verifierService";

export interface DoctorCheckResult {
  name: string;
  passed: boolean;
  message: string;
  fixHint?: string;
}

const REQUIRED_CHAIN_ID = 91562037;
const MIN_BALANCE_ETHER = "0.005";
const PORT = Number(process.env.PORT || 4000);

export async function runDoctorChecks(options: {
  checkPort?: boolean;
  checkSimulator?: boolean;
  isStartup?: boolean;
} = {}): Promise<{ allPassed: boolean; results: DoctorCheckResult[] }> {
  const results: DoctorCheckResult[] = [];

  // Check 1: RPC reachable and chainId == 91562037
  try {
    const network = await provider.getNetwork();
    const chainIdNum = Number(network.chainId);
    if (chainIdNum === REQUIRED_CHAIN_ID) {
      results.push({
        name: "RPC & Chain ID",
        passed: true,
        message: `Connected to ${RPC_URL} (Chain ID: ${chainIdNum})`,
      });
    } else {
      results.push({
        name: "RPC & Chain ID",
        passed: false,
        message: `Connected to ${RPC_URL} but chain ID is ${chainIdNum}, expected ${REQUIRED_CHAIN_ID}`,
        fixHint: `Set RPC_URL to https://testnetrpc.mstblockchain.com or ensure your node is on MST Testnet (91562037).`,
      });
    }
  } catch (err: any) {
    results.push({
      name: "RPC & Chain ID",
      passed: false,
      message: `Failed to connect to RPC (${RPC_URL}): ${err?.message || err}`,
      fixHint: `Check internet connection and verify RPC_URL in .env (${RPC_URL}).`,
    });
  }

  // Check 2: Contract addresses have code on-chain
  try {
    const registryCode = await provider.getCode(cfg.addresses.MachineRegistry);
    const escrowCode = await provider.getCode(cfg.addresses.JobEscrow);

    const regOk = registryCode && registryCode !== "0x" && registryCode.length > 2;
    const escOk = escrowCode && escrowCode !== "0x" && escrowCode.length > 2;

    if (regOk && escOk) {
      results.push({
        name: "Contracts On-Chain Code",
        passed: true,
        message: `MachineRegistry (${cfg.addresses.MachineRegistry.slice(0, 10)}…) and JobEscrow (${cfg.addresses.JobEscrow.slice(0, 10)}…) have verified bytecode.`,
      });
    } else {
      results.push({
        name: "Contracts On-Chain Code",
        passed: false,
        message: `One or more contracts have no code on-chain (Registry: ${regOk ? "FOUND" : "EMPTY 0x"}, Escrow: ${escOk ? "FOUND" : "EMPTY 0x"}).`,
        fixHint: `Run 'npm run deploy:mst' in repository root to deploy contracts to MST Testnet and sync machinapay.contracts.json.`,
      });
    }
  } catch (err: any) {
    results.push({
      name: "Contracts On-Chain Code",
      passed: false,
      message: `Failed to fetch contract bytecode: ${err?.message || err}`,
      fixHint: `Ensure RPC is accessible and contract addresses in integration/machinapay.contracts.json are correct.`,
    });
  }

  // Check 3: M-042 registered and active
  try {
    const registry = getRegistry();
    const m042Bytes = encodeBytes32String("M-042");
    const isReg = await registry.isRegistered(m042Bytes);
    if (!isReg) {
      results.push({
        name: "Machine M-042 Registration",
        passed: false,
        message: "M-042 is NOT registered in MachineRegistry.",
        fixHint: `Run 'npm run seed:mst' in repository root to register M-042 and stake testnet coins.`,
      });
    } else {
      const info = await registry.getMachine(m042Bytes);
      if (info.active) {
        results.push({
          name: "Machine M-042 Registration",
          passed: true,
          message: `M-042 is registered and ACTIVE (Wallet: ${info.wallet.slice(0, 10)}…, Stake: ${formatEther(info.stake)} ${cfg.nativeToken}).`,
        });
      } else {
        results.push({
          name: "Machine M-042 Registration",
          passed: false,
          message: `M-042 is registered but INACTIVE.`,
          fixHint: `Check stake or reactivation requirements in MachineRegistry. Run 'npm run seed:mst'.`,
        });
      }
    }
  } catch (err: any) {
    results.push({
      name: "Machine M-042 Registration",
      passed: false,
      message: `Failed to check M-042 in registry: ${err?.message || err}`,
      fixHint: `Verify MachineRegistry contract address and RPC connectivity.`,
    });
  }

  // Check 4: Machine wallet and verifier wallet balances above threshold
  try {
    const machineAddr = getMachineAddress("M-042");
    const verifierAddr = getVerifierAddress();

    const mBal = await provider.getBalance(machineAddr);
    const vBal = await provider.getBalance(verifierAddr);

    const minWei = 5000000000000000n; // 0.005 tMSTC
    const mOk = mBal >= minWei;
    const vOk = vBal >= minWei;

    if (mOk && vOk) {
      results.push({
        name: "Wallet Balances for Gas",
        passed: true,
        message: `Machine M-042: ${formatEther(mBal)} ${cfg.nativeToken}, Verifier: ${formatEther(vBal)} ${cfg.nativeToken}`,
      });
    } else {
      results.push({
        name: "Wallet Balances for Gas",
        passed: false,
        message: `Balances below threshold (${MIN_BALANCE_ETHER} ${cfg.nativeToken}): Machine=${formatEther(mBal)}, Verifier=${formatEther(vBal)}`,
        fixHint: `Fund machine (${machineAddr}) and/or verifier (${verifierAddr}) with testnet coins from a funded account.`,
      });
    }
  } catch (err: any) {
    results.push({
      name: "Wallet Balances for Gas",
      passed: false,
      message: `Failed to check wallet balances: ${err?.message || err}`,
      fixHint: `Ensure private keys in .env are valid 64-char hex strings and RPC is online.`,
    });
  }

  // Check 5: Verifier address matches escrow
  try {
    const escrow = getEscrow();
    const escrowVerifier = await escrow.verifier();
    const localVerifier = getVerifierAddress();

    if (escrowVerifier.toLowerCase() === localVerifier.toLowerCase()) {
      results.push({
        name: "Verifier Address Match",
        passed: true,
        message: `Configured verifier (${localVerifier}) matches on-chain JobEscrow verifier.`,
      });
    } else {
      results.push({
        name: "Verifier Address Match",
        passed: false,
        message: `Verifier mismatch! JobEscrow=${escrowVerifier}, Local VERIFIER_PRIVATE_KEY=${localVerifier}`,
        fixHint: `Set VERIFIER_PRIVATE_KEY in .env to the private key for ${escrowVerifier}.`,
      });
    }
  } catch (err: any) {
    results.push({
      name: "Verifier Address Match",
      passed: false,
      message: `Failed to check escrow verifier: ${err?.message || err}`,
      fixHint: `Ensure JobEscrow address is valid on MST Testnet.`,
    });
  }

  // Check 6: Metadata store writable
  try {
    const dataDir = path.join(__dirname, "..", "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const testFile = path.join(dataDir, `.doctor_test_${Date.now()}.tmp`);
    fs.writeFileSync(testFile, "test", "utf8");
    fs.unlinkSync(testFile);
    results.push({
      name: "Metadata Store Writable",
      passed: true,
      message: `Data directory (${dataDir}) is writable.`,
    });
  } catch (err: any) {
    results.push({
      name: "Metadata Store Writable",
      passed: false,
      message: `Data directory is not writable: ${err?.message || err}`,
      fixHint: `Grant write permissions to Backend-service/data directory.`,
    });
  }

  // Check 7: Port 4000 listening on 0.0.0.0
  if (options.isStartup) {
    results.push({
      name: `Port ${PORT} Listening`,
      passed: true,
      message: `Server is binding to 0.0.0.0:${PORT}.`,
    });
  } else {
    const portOpen = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket.on("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
      socket.on("timeout", () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(PORT, "127.0.0.1");
    });

    if (portOpen) {
      results.push({
        name: `Port ${PORT} Listening`,
        passed: true,
        message: `Service is listening on port ${PORT}.`,
      });
    } else {
      results.push({
        name: `Port ${PORT} Listening`,
        passed: false,
        message: `Nothing is listening on port ${PORT}.`,
        fixHint: `Start Backend-service using 'npm run dev' inside Backend-service directory.`,
      });
    }
  }

  // Check 8: Simulator socket connected for M-042
  try {
    const res = await fetch(`http://localhost:${PORT}/api/simulator/status`).catch(() => null);
    if (res && res.ok) {
      const data = (await res.json()) as any;
      const m042 = (data.machines || []).find((m: any) => m.machineId === "M-042");
      if (m042 && m042.connected) {
        results.push({
          name: "Simulator Socket (M-042)",
          passed: true,
          message: `Simulator M-042 is connected via WebSocket (Robot state: ${m042.robotState}).`,
        });
      } else {
        results.push({
          name: "Simulator Socket (M-042)",
          passed: false,
          message: `Simulator for M-042 is not connected to backend.`,
          fixHint: `Start machinapay-simulator (npm run dev on port 5174) with VITE_SIMULATOR_WS_URL=ws://localhost:4000/ws.`,
        });
      }
    } else {
      results.push({
        name: "Simulator Socket (M-042)",
        passed: false,
        message: `Backend API /api/simulator/status could not be queried.`,
        fixHint: `Ensure Backend-service is running on port 4000 and simulator is running on port 5174.`,
      });
    }
  } catch (err: any) {
    results.push({
      name: "Simulator Socket (M-042)",
      passed: false,
      message: `Simulator check failed: ${err?.message || err}`,
      fixHint: `Start machinapay-simulator on port 5174.`,
    });
  }

  const allPassed = results.every((r) => r.passed);
  return { allPassed, results };
}

export function printDoctorResults(results: DoctorCheckResult[]) {
  console.log("\n=======================================================");
  console.log("             MACHINAPAY SYSTEM DOCTOR                 ");
  console.log("=======================================================");

  for (const r of results) {
    const statusTag = r.passed ? "\x1b[32m[PASS]\x1b[0m" : "\x1b[31m[FAIL]\x1b[0m";
    console.log(`${statusTag} ${r.name}`);
    console.log(`       ${r.message}`);
    if (!r.passed && r.fixHint) {
      console.log(`       \x1b[33mFix Hint:\x1b[0m ${r.fixHint}`);
    }
  }
  console.log("=======================================================\n");
}

if (require.main === module) {
  runDoctorChecks().then(({ allPassed, results }) => {
    printDoctorResults(results);
    process.exit(allPassed ? 0 : 1);
  });
}
