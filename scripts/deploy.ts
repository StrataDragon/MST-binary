import * as fs from "fs";
import * as path from "path";
import hre from "hardhat";

async function main() {
  const signers = await hre.ethers.getSigners();
  const [deployer] = signers;
  const network = hre.network.name;
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;

  console.log(`Deploying to network: ${network} (chainId: ${chainId})`);
  console.log(`Deployer address: ${deployer.address}`);

  // Resolve verifier address from env or derive from private key or signers
  let verifier = process.env.VERIFIER_ADDRESS;
  if (!verifier && process.env.VERIFIER_PRIVATE_KEY && /^0x[0-9a-fA-F]{64}$/.test(process.env.VERIFIER_PRIVATE_KEY)) {
    verifier = new hre.ethers.Wallet(process.env.VERIFIER_PRIVATE_KEY).address;
  }
  if (!verifier) {
    if (network === "localhost" || network === "hardhat") {
      // Use Account #3 on local test node if available
      verifier = signers[3]?.address || "0x5C024AF5878888a9F1d4E1aAfF6a928DEc812225";
    } else {
      throw new Error("Missing VERIFIER_ADDRESS or VERIFIER_PRIVATE_KEY in environment for deployment.");
    }
  }
  console.log(`Verifier address: ${verifier}`);

  // 1. Deploy MachineRegistry
  const MachineRegistry = await hre.ethers.getContractFactory("MachineRegistry");
  const minStakeStr = process.env.MIN_STAKE || "0";
  const minStake = hre.ethers.parseEther(minStakeStr);
  const registry = await MachineRegistry.deploy(deployer.address, minStake);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  const regDeployTx = registry.deploymentTransaction();
  console.log(`MachineRegistry deployed to: ${registryAddress}`);

  // 2. Deploy JobEscrow
  const JobEscrow = await hre.ethers.getContractFactory("JobEscrow");
  const escrow = await JobEscrow.deploy(registryAddress, verifier);
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  const escrowDeployTx = escrow.deploymentTransaction();
  console.log(`JobEscrow deployed to: ${escrowAddress}`);

  // 3. Link JobEscrow in MachineRegistry
  const setEscrowTx = await registry.setEscrow(escrowAddress);
  await setEscrowTx.wait();
  console.log(`Linked JobEscrow in MachineRegistry (tx: ${setEscrowTx.hash})`);

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
    (network === "mst" ? "tMSTC" : "ETH");

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

  // Write to root integration/
  const rootIntegration = path.join(__dirname, "..", "integration");
  fs.mkdirSync(rootIntegration, { recursive: true });
  fs.writeFileSync(path.join(rootIntegration, "machinapay.contracts.json"), contractsJsonStr);

  // Write to Backend-service/integration/
  const backendIntegration = path.join(__dirname, "..", "Backend-service", "integration");
  fs.mkdirSync(backendIntegration, { recursive: true });
  fs.writeFileSync(path.join(backendIntegration, "machinapay.contracts.json"), contractsJsonStr);

  // Write to machinapay-frontend/integration/
  const frontendIntegration = path.join(__dirname, "..", "machinapay-frontend", "integration");
  fs.mkdirSync(frontendIntegration, { recursive: true });
  fs.writeFileSync(path.join(frontendIntegration, "machinapay.contracts.json"), contractsJsonStr);

  // Write deployments/ JSON
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });

  const deploymentData = {
    network,
    chainId: Number(chainId),
    explorerUrl,
    nativeToken,
    deployer: deployer.address,
    MachineRegistry: registryAddress,
    JobEscrow: escrowAddress,
    MockToken: null,
    verifier,
    minStake: minStake.toString(),
    evmVersion: "paris",
    eip712: contractsConfig.eip712,
    transactions: {
      deployMachineRegistry: regDeployTx?.hash,
      deployJobEscrow: escrowDeployTx?.hash,
      registrySetEscrow: setEscrowTx.hash,
    },
    blockNumbers: {
      deployMachineRegistry: regDeployTx ? (await regDeployTx.wait())?.blockNumber : 1,
      deployJobEscrow: escrowDeployTx ? (await escrowDeployTx.wait())?.blockNumber : 2,
      registrySetEscrow: (await setEscrowTx.wait())?.blockNumber,
    },
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(deploymentsDir, `${network}.json`),
    JSON.stringify(deploymentData, null, 2)
  );
  fs.writeFileSync(
    path.join(deploymentsDir, "deployment.json"),
    JSON.stringify(deploymentData, null, 2)
  );

  console.log("Deployment files and machinapay.contracts.json synced across all modules successfully!");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

