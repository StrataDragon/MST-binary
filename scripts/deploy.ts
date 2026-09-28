import * as fs from "fs";
import * as path from "path";
import hre from "hardhat";

async function main() {
  const signers = await hre.ethers.getSigners();
  const [deployer] = signers;
  const network = hre.network.name;
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  const isForce = process.argv.includes("--force");

  console.log(`[DEPLOY] Network: ${network} (Chain ID: ${chainId})`);
  if (!deployer) {
    throw new Error("No deployer signer available. Ensure MST_PRIVATE_KEY is set in .env.");
  }
  console.log(`Deployer address: ${deployer.address}`);

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });

  const mstDeploymentPath = path.join(deploymentsDir, "mst-testnet.json");
  const targetDeploymentPath = network === "mst" ? mstDeploymentPath : path.join(deploymentsDir, `${network}.json`);

  // Check for existing deployment and idempotency
  let existingDeployment: any = null;
  if (fs.existsSync(targetDeploymentPath)) {
    try {
      existingDeployment = JSON.parse(fs.readFileSync(targetDeploymentPath, "utf8"));
    } catch {
      existingDeployment = null;
    }
  }

  let registryAddress = existingDeployment?.MachineRegistry || existingDeployment?.machineRegistry;
  let escrowAddress = existingDeployment?.JobEscrow || existingDeployment?.jobEscrow;

  let canSkip = false;
  if (!isForce && registryAddress && escrowAddress) {
    const [regCode, escrowCode] = await Promise.all([
      hre.ethers.provider.getCode(registryAddress).catch(() => "0x"),
      hre.ethers.provider.getCode(escrowAddress).catch(() => "0x"),
    ]);
    if (regCode !== "0x" && escrowCode !== "0x") {
      console.log(`[IDEMPOTENT] Valid contracts already exist on-chain:`);
      console.log(`  MachineRegistry: ${registryAddress}`);
      console.log(`  JobEscrow:       ${escrowAddress}`);
      console.log(`Skipping deployment. (Pass --force to redeploy)`);
      canSkip = true;
    }
  }

  // Resolve verifier address
  let verifier = process.env.VERIFIER_ADDRESS;
  if (!verifier && process.env.VERIFIER_PRIVATE_KEY && /^0x[0-9a-fA-F]{64}$/.test(process.env.VERIFIER_PRIVATE_KEY)) {
    verifier = new hre.ethers.Wallet(process.env.VERIFIER_PRIVATE_KEY).address;
  }
  if (!verifier) {
    if (network === "localhost" || network === "hardhat") {
      verifier = signers[3]?.address || "0x5C024AF5878888a9F1d4E1aAfF6a928DEc812225";
    } else {
      verifier = existingDeployment?.verifier || "0x5C024AF5878888a9F1d4E1aAfF6a928DEc812225";
    }
  }
  console.log(`Verifier address: ${verifier}`);

  let regDeployTx: any = null;
  let escrowDeployTx: any = null;
  let setEscrowTx: any = null;
  let deploymentBlock = 1;

  if (!canSkip) {
    // 1. Deploy MachineRegistry
    const MachineRegistry = await hre.ethers.getContractFactory("MachineRegistry");
    const minStakeStr = process.env.MIN_STAKE || "0";
    const minStake = hre.ethers.parseEther(minStakeStr);
    const registry = await MachineRegistry.deploy(deployer.address, minStake);
    await registry.waitForDeployment();
    registryAddress = await registry.getAddress();
    regDeployTx = registry.deploymentTransaction();
    console.log(`MachineRegistry deployed to: ${registryAddress}`);

    // 2. Deploy JobEscrow
    const JobEscrow = await hre.ethers.getContractFactory("JobEscrow");
    const escrow = await JobEscrow.deploy(registryAddress, verifier);
    await escrow.waitForDeployment();
    escrowAddress = await escrow.getAddress();
    escrowDeployTx = escrow.deploymentTransaction();
    console.log(`JobEscrow deployed to: ${escrowAddress}`);

    // 3. Link JobEscrow in MachineRegistry
    setEscrowTx = await registry.setEscrow(escrowAddress);
    await setEscrowTx.wait();
    console.log(`Linked JobEscrow in MachineRegistry (tx: ${setEscrowTx.hash})`);

    const receipt = regDeployTx ? await regDeployTx.wait() : null;
    deploymentBlock = receipt?.blockNumber || (await hre.ethers.provider.getBlockNumber());

    // 4. On local chain, fund verifier wallet with gas if needed
    if (network === "localhost" || network === "hardhat") {
      const verifierBal = await hre.ethers.provider.getBalance(verifier);
      if (verifierBal < hre.ethers.parseEther("1")) {
        const fundAmount = process.env.LOCAL_VERIFIER_FUND_ETH || "10";
        const fundTx = await deployer.sendTransaction({
          to: verifier,
          value: hre.ethers.parseEther(fundAmount),
        });
        await fundTx.wait();
        console.log(`Funded verifier wallet ${verifier} with ${fundAmount} ETH for gas`);
      }
    }
  }

  // 5. Read ABIs
  const registryArtifact = await hre.artifacts.readArtifact("MachineRegistry");
  const escrowArtifact = await hre.artifacts.readArtifact("JobEscrow");

  const rpcUrl =
    process.env.RPC_URL ||
    (network === "mst"
      ? (process.env.MST_RPC_URL || "https://testnetrpc.mstblockchain.com")
      : (process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545"));
  const explorerUrl =
    process.env.EXPLORER_URL ||
    (network === "mst"
      ? (process.env.MST_EXPLORER_URL || "https://testnet.mstscan.com")
      : null);
  const nativeToken =
    process.env.NATIVE_TOKEN ||
    (network === "mst" ? "tMSTC" : "MSTC");

  const contractsConfig = {
    network,
    chainId: Number(chainId),
    rpcUrl,
    explorerUrl,
    nativeToken,
    addresses: {
      MachineRegistry: registryAddress,
      JobEscrow: escrowAddress,
    },
    verifier,
    eip712: {
      name: "MachinaPay JobEscrow",
      version: "1",
      chainId: Number(chainId),
      verifyingContract: escrowAddress,
    },
    abi: {
      MachineRegistry: registryArtifact.abi,
      JobEscrow: escrowArtifact.abi,
    },
  };

  const contractsJsonStr = JSON.stringify(contractsConfig, null, 2);

  // Sync integration/machinapay.contracts.json
  const dirsToSync = [
    path.join(__dirname, "..", "integration"),
    path.join(__dirname, "..", "Backend-service", "integration"),
    path.join(__dirname, "..", "machinapay-frontend", "integration"),
  ];

  for (const d of dirsToSync) {
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, "machinapay.contracts.json"), contractsJsonStr);
  }

  // Export standalone ABIs to integration/abi/
  const abiDir = path.join(__dirname, "..", "integration", "abi");
  fs.mkdirSync(abiDir, { recursive: true });
  fs.writeFileSync(
    path.join(abiDir, "MachineRegistry.json"),
    JSON.stringify(registryArtifact.abi, null, 2)
  );
  fs.writeFileSync(
    path.join(abiDir, "JobEscrow.json"),
    JSON.stringify(escrowArtifact.abi, null, 2)
  );

  // Write deployments JSONs
  const deploymentData = {
    network,
    chainId: Number(chainId),
    explorerUrl,
    nativeToken,
    deployer: deployer.address,
    MachineRegistry: registryAddress,
    JobEscrow: escrowAddress,
    machineRegistry: registryAddress,
    jobEscrow: escrowAddress,
    deploymentBlock,
    verifier,
    minStake: (process.env.MIN_STAKE || "0").toString(),
    evmVersion: "paris",
    eip712: contractsConfig.eip712,
    transactions: {
      deployMachineRegistry: regDeployTx?.hash || existingDeployment?.transactions?.deployMachineRegistry,
      deployJobEscrow: escrowDeployTx?.hash || existingDeployment?.transactions?.deployJobEscrow,
      registrySetEscrow: setEscrowTx?.hash || existingDeployment?.transactions?.registrySetEscrow,
    },
    deployedAt: canSkip ? existingDeployment?.deployedAt : new Date().toISOString(),
  };

  if (network === "mst") {
    fs.writeFileSync(mstDeploymentPath, JSON.stringify(deploymentData, null, 2));
  }
  fs.writeFileSync(path.join(deploymentsDir, `${network}.json`), JSON.stringify(deploymentData, null, 2));
  fs.writeFileSync(path.join(deploymentsDir, "deployment.json"), JSON.stringify(deploymentData, null, 2));

  console.log("--------------------------------------------------");
  console.log(`Deployment complete!`);
  console.log(`Network:          ${network} (Chain ID: ${chainId})`);
  console.log(`MachineRegistry:  ${registryAddress}`);
  console.log(`JobEscrow:        ${escrowAddress}`);
  console.log(`Verifier:         ${verifier}`);
  console.log(`Artifacts & ABIs updated in integration/ and deployments/`);
  console.log("--------------------------------------------------");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
