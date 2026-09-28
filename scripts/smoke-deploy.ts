import hre from "hardhat";

async function main() {
  const network = hre.network.name;
  console.log(`[SMOKE TEST] Testing network connectivity & deployment readiness on: ${network}`);

  const provider = hre.ethers.provider;
  const net = await provider.getNetwork();
  console.log(`Connected to Chain ID: ${net.chainId}`);

  const blockNumber = await provider.getBlockNumber();
  console.log(`Current Block Number: ${blockNumber}`);

  const signers = await hre.ethers.getSigners();
  if (signers.length > 0) {
    const bal = await provider.getBalance(signers[0].address);
    console.log(`Signer ${signers[0].address} balance: ${hre.ethers.formatEther(bal)} native tokens`);
  }

  console.log(`[PASS] Smoke test completed successfully for network ${network}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
