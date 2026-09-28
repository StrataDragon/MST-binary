import hre from "hardhat";

async function main() {
  const network = hre.network.name;
  console.log(`========================================`);
  console.log(`Checking Network Configuration: [${network}]`);
  console.log(`========================================`);

  try {
    const provider = hre.ethers.provider;
    const net = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    const feeData = await provider.getFeeData();

    console.log(`Chain ID:      ${net.chainId}`);
    console.log(`Current Block: ${blockNumber}`);
    console.log(`Gas Price:     ${feeData.gasPrice ? hre.ethers.formatUnits(feeData.gasPrice, "gwei") + " gwei" : "N/A"}`);

    if (network === "mst") {
      const expectedChainId = 91562037n;
      if (net.chainId !== expectedChainId) {
        console.warn(`[WARNING] Connected chainId (${net.chainId}) does not match MST Testnet standard (${expectedChainId})!`);
      } else {
        console.log(`[PASS] Chain ID matches MST Testnet (91562037).`);
      }
    }

    const signers = await hre.ethers.getSigners();
    if (signers.length > 0) {
      const deployer = signers[0];
      const bal = await provider.getBalance(deployer.address);
      console.log(`Deployer:      ${deployer.address}`);
      console.log(`Balance:       ${hre.ethers.formatEther(bal)} native tokens`);
      if (bal === 0n) {
        console.log(`[NOTICE] Deployer balance is 0. Request testnet funds from faucet: https://faucet.masterstroke.academy`);
      }
    } else {
      console.log(`No signers configured for network [${network}]. Set MST_PRIVATE_KEY in .env to deploy transactions.`);
    }

    console.log(`[SUCCESS] RPC connection healthy.`);
  } catch (err: any) {
    console.error(`[ERROR] Failed to query network [${network}]:`, err.message || err);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
