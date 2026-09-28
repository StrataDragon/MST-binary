import * as fs from "fs";
import * as path from "path";
import hre from "hardhat";

async function main() {
  const network = hre.network.name;
  console.log(`========================================`);
  console.log(`Validating Deployment: [${network}]`);
  console.log(`========================================`);

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const mstFile = path.join(deploymentsDir, "mst-testnet.json");
  const fallbackFile = path.join(deploymentsDir, `${network}.json`);
  const deployFile = fs.existsSync(mstFile) && network === "mst" ? mstFile : fallbackFile;

  let regAddress = process.env.MACHINE_REGISTRY_ADDRESS;
  let escrowAddress = process.env.JOB_ESCROW_ADDRESS;
  let verifierAddress = process.env.VERIFIER_ADDRESS;

  if (fs.existsSync(deployFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(deployFile, "utf8"));
      regAddress = regAddress || data.MachineRegistry || data.machineRegistry;
      escrowAddress = escrowAddress || data.JobEscrow || data.jobEscrow;
      verifierAddress = verifierAddress || data.verifier;
    } catch {
      // ignore
    }
  }

  if (!regAddress || !escrowAddress) {
    console.error(`Missing contract addresses. Run 'npm run deploy:mst' first.`);
    process.exit(1);
  }

  const provider = hre.ethers.provider;
  const net = await provider.getNetwork();

  // 1. Verify Bytecode Exists
  const [regCode, escrowCode] = await Promise.all([
    provider.getCode(regAddress),
    provider.getCode(escrowAddress),
  ]);

  if (regCode === "0x") {
    console.error(`[FAIL] No contract code found at MachineRegistry address: ${regAddress}`);
    process.exit(1);
  }
  if (escrowCode === "0x") {
    console.error(`[FAIL] No contract code found at JobEscrow address: ${escrowAddress}`);
    process.exit(1);
  }
  console.log(`[PASS] MachineRegistry code verified at ${regAddress}`);
  console.log(`[PASS] JobEscrow code verified at ${escrowAddress}`);

  // 2. Verify Contract Linking
  const MachineRegistry = await hre.ethers.getContractFactory("MachineRegistry");
  const JobEscrow = await hre.ethers.getContractFactory("JobEscrow");

  const registry = MachineRegistry.attach(regAddress) as any;
  const escrow = JobEscrow.attach(escrowAddress) as any;

  const linkedEscrow = await registry.escrow();
  const linkedRegistry = await escrow.registry();
  const linkedVerifier = await escrow.verifier();

  if (linkedEscrow.toLowerCase() !== escrowAddress.toLowerCase()) {
    console.error(`[FAIL] MachineRegistry.escrow() (${linkedEscrow}) != JobEscrow (${escrowAddress})`);
    process.exit(1);
  }
  console.log(`[PASS] MachineRegistry.escrow() properly linked to JobEscrow.`);

  if (linkedRegistry.toLowerCase() !== regAddress.toLowerCase()) {
    console.error(`[FAIL] JobEscrow.registry() (${linkedRegistry}) != MachineRegistry (${regAddress})`);
    process.exit(1);
  }
  console.log(`[PASS] JobEscrow.registry() properly linked to MachineRegistry.`);

  if (verifierAddress && linkedVerifier.toLowerCase() !== verifierAddress.toLowerCase()) {
    console.warn(`[WARN] JobEscrow.verifier() (${linkedVerifier}) does not match expected (${verifierAddress})`);
  } else {
    console.log(`[PASS] JobEscrow.verifier() matches authorized verifier (${linkedVerifier}).`);
  }

  // 3. Verify Machine Registrations
  const m042Bytes32 = hre.ethers.encodeBytes32String("M-042");
  const m051Bytes32 = hre.ethers.encodeBytes32String("M-051");

  const [is042Reg, is051Reg] = await Promise.all([
    registry.isRegistered(m042Bytes32),
    registry.isRegistered(m051Bytes32),
  ]);

  console.log(`Machine M-042 (Transport Robot):     ${is042Reg ? "REGISTERED [PASS]" : "NOT REGISTERED (run npm run seed:mst)"}`);
  console.log(`Machine M-051 (Color Sorting Arm):   ${is051Reg ? "REGISTERED [PASS]" : "NOT REGISTERED (run npm run seed:mst)"}`);

  // 4. Print Section 4 Summary Block
  console.log(`\n================================================================`);
  console.log(`MST Testnet / Chain ID: ${net.chainId} / MachineRegistry: ${regAddress} / JobEscrow: ${escrowAddress}`);
  console.log(`================================================================\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
