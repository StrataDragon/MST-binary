import * as fs from "fs";
import * as path from "path";
import hre from "hardhat";

async function main() {
  const signers = await hre.ethers.getSigners();
  const [deployer] = signers;
  const customer = signers[1] || deployer;

  // Resolve machine wallet from env or private key or signer[2]
  let machineWallet = process.env.MACHINE_WALLET_ADDRESS;
  if (!machineWallet && process.env.MACHINE_PRIVATE_KEY && /^0x[0-9a-fA-F]{64}$/.test(process.env.MACHINE_PRIVATE_KEY)) {
    machineWallet = new hre.ethers.Wallet(process.env.MACHINE_PRIVATE_KEY).address;
  }
  if (!machineWallet) {
    machineWallet = signers[2]?.address;
  }
  if (!machineWallet) {
    throw new Error("Unable to determine machine wallet. Set MACHINE_WALLET_ADDRESS or MACHINE_PRIVATE_KEY in .env.");
  }

  const machineSigner =
    process.env.MACHINE_SIGNER_ADDRESS || machineWallet;

  console.log(`Seeding demo on network: ${hre.network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Customer: ${customer.address}`);
  console.log(`Machine wallet: ${machineWallet}`);

  const contractsPath = path.join(__dirname, "..", "integration", "machinapay.contracts.json");
  if (!fs.existsSync(contractsPath)) {
    throw new Error("machinapay.contracts.json not found. Run deploy first.");
  }
  const cfg = JSON.parse(fs.readFileSync(contractsPath, "utf8"));

  const registry = await hre.ethers.getContractAt(
    "MachineRegistry",
    cfg.addresses.MachineRegistry,
    deployer
  );
  const escrow = await hre.ethers.getContractAt(
    "JobEscrow",
    cfg.addresses.JobEscrow,
    customer
  );

  const machineIdStr = process.env.MACHINE_ID || "M-042";
  const machineIdBytes32 = hre.ethers.encodeBytes32String(machineIdStr);

  // Check if machine M-042 is registered
  const isRegistered = await registry.isRegistered(machineIdBytes32);
  let regTxHash = "";
  const stakeEther = process.env.MACHINE_STAKE || "0.01";
  if (!isRegistered) {
    const regTx = await registry.registerMachine(
      machineIdBytes32,
      machineWallet,
      machineSigner,
      { value: hre.ethers.parseEther(stakeEther) }
    );
    const regReceipt = await regTx.wait();
    regTxHash = regReceipt?.hash || regTx.hash;
    console.log(`Registered machine ${machineIdStr} with stake ${stakeEther} (tx: ${regTxHash})`);
  } else {
    console.log(`Machine ${machineIdStr} already registered.`);
  }

  // Register machine M-051 (Robotic Pick-and-Place Color Sorting Arm)
  const machine051IdStr = process.env.MACHINE_051_ID || "M-051";
  const machine051Bytes32 = hre.ethers.encodeBytes32String(machine051IdStr);
  let machine051Wallet = process.env.MACHINE_051_WALLET_ADDRESS;
  if (!machine051Wallet && process.env.MACHINE_051_PRIVATE_KEY && /^0x[0-9a-fA-F]{64}$/.test(process.env.MACHINE_051_PRIVATE_KEY)) {
    machine051Wallet = new hre.ethers.Wallet(process.env.MACHINE_051_PRIVATE_KEY).address;
  }
  if (!machine051Wallet) {
    if (hre.network.name === "localhost" || hre.network.name === "hardhat") {
      machine051Wallet = signers[4]?.address || machineWallet;
    } else {
      // Documented reuse of machineWallet if separate M-051 wallet is not provided in env
      machine051Wallet = machineWallet;
    }
  }
  const machine051Signer = process.env.MACHINE_051_SIGNER_ADDRESS || machine051Wallet;

  const is051Registered = await registry.isRegistered(machine051Bytes32);
  let reg051TxHash = "";
  if (!is051Registered) {
    const reg051Tx = await registry.registerMachine(
      machine051Bytes32,
      machine051Wallet,
      machine051Signer,
      { value: hre.ethers.parseEther(stakeEther) }
    );
    const reg051Receipt = await reg051Tx.wait();
    reg051TxHash = reg051Receipt?.hash || reg051Tx.hash;
    console.log(`Registered machine ${machine051IdStr} with stake ${stakeEther} (tx: ${reg051TxHash})`);
  } else {
    console.log(`Machine ${machine051IdStr} already registered.`);
  }

  // Fund machine wallets on localhost if needed
  if (hre.network.name === "localhost" || hre.network.name === "hardhat") {
    const machineBal = await hre.ethers.provider.getBalance(machineWallet);
    if (machineBal < hre.ethers.parseEther("1")) {
      const fundAmount = process.env.LOCAL_MACHINE_FUND_ETH || "10";
      const fundTx = await deployer.sendTransaction({
        to: machineWallet,
        value: hre.ethers.parseEther(fundAmount),
      });
      await fundTx.wait();
      console.log(`Funded machine wallet ${machineWallet} with ${fundAmount} ETH`);
    }

    const machine051Bal = await hre.ethers.provider.getBalance(machine051Wallet);
    if (machine051Bal < hre.ethers.parseEther("1")) {
      const fundTx = await deployer.sendTransaction({
        to: machine051Wallet,
        value: hre.ethers.parseEther("10"),
      });
      await fundTx.wait();
      console.log(`Funded machine M-051 wallet ${machine051Wallet} with 10 ETH`);
    }
  }

  // Create demo job (opt-in only via --create-job flag or CREATE_DEMO_JOB=true)
  const shouldCreateJob = process.argv.includes("--create-job") || process.env.CREATE_DEMO_JOB === "true";
  let createJobTxHash = "";
  let createdJobInfo: any = null;

  if (shouldCreateJob) {
    const description = process.env.DEMO_JOB_DESCRIPTION || "Move package A to green zone";
    const jobId = hre.ethers.keccak256(
      hre.ethers.toUtf8Bytes(`demo-job-${Date.now()}-${Math.random()}`)
    );
    const metadataHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(description));
    const duration = Number(process.env.JOB_DURATION_SECONDS || 3600);
    const rewardEther = process.env.JOB_REWARD || "2.2";
    const reward = hre.ethers.parseEther(rewardEther);

    const createTx = await escrow.createJob(jobId, metadataHash, duration, description, {
      value: reward,
    });
    const createReceipt = await createTx.wait();
    createJobTxHash = createReceipt?.hash || createTx.hash;
    console.log(`Created demo job ${jobId} (reward: ${rewardEther}) (tx: ${createJobTxHash})`);
    createdJobInfo = {
      jobId,
      description,
      metadataHash,
      reward: reward.toString(),
      deadline: (Math.floor(Date.now() / 1000) + duration).toString(),
      customer: customer.address,
    };
  } else {
    console.log("Skipping demo job creation by default (pass --create-job to create one).");
  }

  const demoData = {
    network: hre.network.name,
    chainId: cfg.chainId,
    machineId: machineIdStr,
    machineIdBytes32,
    machineWallet,
    machineSigner,
    machine051: {
      machineId: machine051IdStr,
      machineIdBytes32: machine051Bytes32,
      machineWallet: machine051Wallet,
      machineSigner: machine051Signer,
    },
    job: createdJobInfo,
    transactions: {
      registerMachine: regTxHash,
      registerMachine051: reg051TxHash,
      createJob: createJobTxHash || undefined,
    },
    note: "Public info only. No private keys.",
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  fs.writeFileSync(path.join(deploymentsDir, "demo.json"), JSON.stringify(demoData, null, 2));
  console.log("Demo seeded successfully. Written to deployments/demo.json");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

