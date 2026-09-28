import { expect } from "chai";
import hre from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { JobEscrow, MachineRegistry } from "../typechain-types";

describe("MachinaPay Blockchain Core Tests", () => {
  let deployer: HardhatEthersSigner;
  let customer: HardhatEthersSigner;
  let machineWallet: HardhatEthersSigner;
  let machineSigner: HardhatEthersSigner;
  let verifier: HardhatEthersSigner;
  let unauthorized: HardhatEthersSigner;

  let registry: MachineRegistry;
  let escrow: JobEscrow;

  const machineIdText = "M-042";
  let machineIdBytes32: string;

  beforeEach(async () => {
    [deployer, customer, machineWallet, machineSigner, verifier, unauthorized] =
      await hre.ethers.getSigners();

    machineIdBytes32 = hre.ethers.encodeBytes32String(machineIdText);

    // Deploy MachineRegistry
    const MachineRegistryFactory = await hre.ethers.getContractFactory("MachineRegistry");
    registry = await MachineRegistryFactory.deploy(deployer.address, 0);
    await registry.waitForDeployment();

    // Deploy JobEscrow
    const JobEscrowFactory = await hre.ethers.getContractFactory("JobEscrow");
    escrow = await JobEscrowFactory.deploy(await registry.getAddress(), verifier.address);
    await escrow.waitForDeployment();

    // Link JobEscrow in MachineRegistry
    await registry.setEscrow(await escrow.getAddress());
  });

  describe("MachineRegistry", () => {
    it("allows a machine to register with stake", async () => {
      const stake = hre.ethers.parseEther("0.1");
      await expect(
        registry.connect(machineWallet).registerMachine(
          machineIdBytes32,
          machineWallet.address,
          machineSigner.address,
          { value: stake }
        )
      )
        .to.emit(registry, "MachineRegistered")
        .withArgs(machineIdBytes32, machineWallet.address, machineWallet.address, machineSigner.address, stake);

      expect(await registry.isRegistered(machineIdBytes32)).to.be.true;
      expect(await registry.isActive(machineIdBytes32)).to.be.true;

      const m = await registry.getMachine(machineIdBytes32);
      expect(m.wallet).to.equal(machineWallet.address);
      expect(m.signer).to.equal(machineSigner.address);
      expect(m.stake).to.equal(stake);
      expect(m.reputation).to.equal(100n);
    });

    it("rejects duplicate registration", async () => {
      await registry.registerMachine(machineIdBytes32, machineWallet.address, machineSigner.address);
      await expect(
        registry.registerMachine(machineIdBytes32, machineWallet.address, machineSigner.address)
      ).to.be.revertedWithCustomError(registry, "MachineAlreadyRegistered");
    });

    it("prevents non-escrow from calling recordJobResult", async () => {
      await registry.registerMachine(machineIdBytes32, machineWallet.address, machineSigner.address);
      await expect(
        registry.connect(unauthorized).recordJobResult(machineIdBytes32, true)
      ).to.be.revertedWithCustomError(registry, "OnlyEscrow");
    });

    it("allows owner to deactivate a machine", async () => {
      await registry.registerMachine(machineIdBytes32, machineWallet.address, machineSigner.address);
      await expect(registry.connect(deployer).deactivateMachine(machineIdBytes32))
        .to.emit(registry, "MachineDeactivated")
        .withArgs(machineIdBytes32, deployer.address);

      expect(await registry.isActive(machineIdBytes32)).to.be.false;
    });
  });

  describe("JobEscrow End-to-End Workflow", () => {
    const reward = hre.ethers.parseEther("1.0");
    const duration = 3600;
    const description = "Move package A to green zone";
    let jobId: string;
    let metadataHash: string;

    beforeEach(async () => {
      // Register M-042
      await registry.registerMachine(
        machineIdBytes32,
        machineWallet.address,
        machineSigner.address,
        { value: hre.ethers.parseEther("0.05") }
      );

      jobId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("test-job-1"));
      metadataHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(description));
    });

    it("creates, accepts, executes, proves, attests, and releases payment (Happy Path)", async () => {
      // 1. Create Job
      await expect(
        escrow.connect(customer).createJob(jobId, metadataHash, duration, description, {
          value: reward,
        })
      )
        .to.emit(escrow, "JobCreated")
        .withArgs(jobId, customer.address, reward, metadataHash, (await hre.ethers.provider.getBlock("latest"))!.timestamp + duration + 1, description);

      expect(await escrow.getJobState(jobId)).to.equal(1); // FUNDED

      // 2. Accept Job
      await expect(escrow.connect(machineWallet).acceptJob(jobId, machineIdBytes32))
        .to.emit(escrow, "JobAccepted")
        .withArgs(jobId, machineIdBytes32, machineWallet.address);

      expect(await escrow.getJobState(jobId)).to.equal(2); // ACCEPTED

      // 3. Start Execution
      await expect(escrow.connect(machineWallet).startExecution(jobId))
        .to.emit(escrow, "JobExecutionStarted")
        .withArgs(jobId, machineIdBytes32);

      expect(await escrow.getJobState(jobId)).to.equal(3); // EXECUTING

      // 4. Submit Proof (EIP-712)
      const evidence = {
        packageId: "A",
        target: { zone: "green", x: 9, y: 4 },
        finalPosition: { x: 9, y: 4 },
        delivered: true,
      };
      const evidenceHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(JSON.stringify(evidence)));
      const block = await hre.ethers.provider.getBlock("latest");
      const timestamp = block!.timestamp + 1;
      const nonce = 12345n;

      const domain = {
        name: "MachinaPay JobEscrow",
        version: "1",
        chainId: (await hre.ethers.provider.getNetwork()).chainId,
        verifyingContract: await escrow.getAddress(),
      };

      const proofTypes = {
        Proof: [
          { name: "jobId", type: "bytes32" },
          { name: "machineId", type: "bytes32" },
          { name: "result", type: "uint8" },
          { name: "timestamp", type: "uint64" },
          { name: "nonce", type: "uint256" },
          { name: "evidenceHash", type: "bytes32" },
        ],
      };

      const proof = {
        jobId,
        machineId: machineIdBytes32,
        result: 1, // SUCCESS
        timestamp,
        nonce,
        evidenceHash,
      };

      const proofSig = await machineSigner.signTypedData(domain, proofTypes, proof);

      await expect(escrow.submitProof(proof, proofSig))
        .to.emit(escrow, "ProofSubmitted");

      expect(await escrow.getJobState(jobId)).to.equal(4); // PROOF_SUBMITTED

      const jobData = await escrow.getJob(jobId);
      const proofHash = jobData.proofHash;

      // 5. Submit Attestation (EIP-712 by verifier)
      const attestationTypes = {
        Attestation: [
          { name: "jobId", type: "bytes32" },
          { name: "machineId", type: "bytes32" },
          { name: "proofHash", type: "bytes32" },
          { name: "passed", type: "bool" },
          { name: "timestamp", type: "uint64" },
        ],
      };

      const attestation = {
        jobId,
        machineId: machineIdBytes32,
        proofHash,
        passed: true,
        timestamp: (await hre.ethers.provider.getBlock("latest"))!.timestamp + 1,
      };

      const attestationSig = await verifier.signTypedData(domain, attestationTypes, attestation);

      await expect(escrow.connect(verifier).submitAttestation(attestation, attestationSig))
        .to.emit(escrow, "JobVerified")
        .withArgs(jobId, machineIdBytes32, proofHash);

      expect(await escrow.getJobState(jobId)).to.equal(5); // VERIFIED

      // 6. Release Payment
      const initialBalance = await hre.ethers.provider.getBalance(machineWallet.address);
      await expect(escrow.release(jobId))
        .to.emit(escrow, "PaymentReleased")
        .withArgs(jobId, machineIdBytes32, machineWallet.address, reward);

      expect(await escrow.getJobState(jobId)).to.equal(6); // PAID
      const finalBalance = await hre.ethers.provider.getBalance(machineWallet.address);
      expect(finalBalance - initialBalance).to.equal(reward);
    });

    it("handles verifier rejection and refunds customer", async () => {
      // Create, accept, start
      await escrow.connect(customer).createJob(jobId, metadataHash, duration, description, {
        value: reward,
      });
      await escrow.connect(machineWallet).acceptJob(jobId, machineIdBytes32);
      await escrow.connect(machineWallet).startExecution(jobId);

      // Submit Proof (reported failed or target missed)
      const evidenceHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("fail-evidence"));
      const block = await hre.ethers.provider.getBlock("latest");
      const timestamp = block!.timestamp + 1;
      const nonce = 99999n;

      const domain = {
        name: "MachinaPay JobEscrow",
        version: "1",
        chainId: (await hre.ethers.provider.getNetwork()).chainId,
        verifyingContract: await escrow.getAddress(),
      };

      const proofTypes = {
        Proof: [
          { name: "jobId", type: "bytes32" },
          { name: "machineId", type: "bytes32" },
          { name: "result", type: "uint8" },
          { name: "timestamp", type: "uint64" },
          { name: "nonce", type: "uint256" },
          { name: "evidenceHash", type: "bytes32" },
        ],
      };

      const proof = {
        jobId,
        machineId: machineIdBytes32,
        result: 0, // FAILED
        timestamp,
        nonce,
        evidenceHash,
      };

      const proofSig = await machineSigner.signTypedData(domain, proofTypes, proof);
      await escrow.submitProof(proof, proofSig);

      const jobData = await escrow.getJob(jobId);

      // Verifier rejects (passed = false)
      const attestationTypes = {
        Attestation: [
          { name: "jobId", type: "bytes32" },
          { name: "machineId", type: "bytes32" },
          { name: "proofHash", type: "bytes32" },
          { name: "passed", type: "bool" },
          { name: "timestamp", type: "uint64" },
        ],
      };

      const attestation = {
        jobId,
        machineId: machineIdBytes32,
        proofHash: jobData.proofHash,
        passed: false,
        timestamp: (await hre.ethers.provider.getBlock("latest"))!.timestamp + 1,
      };

      const attestationSig = await verifier.signTypedData(domain, attestationTypes, attestation);
      await escrow.connect(verifier).submitAttestation(attestation, attestationSig);

      // State stays PROOF_SUBMITTED with verdict == 2 (FAIL)
      const jobAfterAttest = await escrow.getJob(jobId);
      expect(jobAfterAttest.state).to.equal(4); // PROOF_SUBMITTED
      expect(jobAfterAttest.verdict).to.equal(2); // FAIL

      // Customer calls refund
      const initialCustBalance = await hre.ethers.provider.getBalance(customer.address);
      const refundTx = await escrow.connect(customer).refund(jobId);
      const receipt = await refundTx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      expect(await escrow.getJobState(jobId)).to.equal(7); // REFUNDED

      const finalCustBalance = await hre.ethers.provider.getBalance(customer.address);
      expect(finalCustBalance + gasUsed - initialCustBalance).to.equal(reward);
    });

    it("allows customer to cancel an unaccepted funded job", async () => {
      await escrow.connect(customer).createJob(jobId, metadataHash, duration, description, {
        value: reward,
      });

      const initialCustBalance = await hre.ethers.provider.getBalance(customer.address);
      const refundTx = await escrow.connect(customer).refund(jobId);
      const receipt = await refundTx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      expect(await escrow.getJobState(jobId)).to.equal(7); // REFUNDED
      const finalCustBalance = await hre.ethers.provider.getBalance(customer.address);
      expect(finalCustBalance + gasUsed - initialCustBalance).to.equal(reward);
    });

    it("enforces reentrancy protection: reverts if receiver attempts to re-enter during release", async () => {
      const ReentrantReceiverFactory = await hre.ethers.getContractFactory("ReentrantReceiver");
      const receiver = await ReentrantReceiverFactory.deploy();
      await receiver.waitForDeployment();
      const receiverAddress = await receiver.getAddress();

      const attackMachineId = hre.ethers.encodeBytes32String("M-ATTACK");
      await registry.registerMachine(
        attackMachineId,
        receiverAddress,
        machineSigner.address,
        { value: hre.ethers.parseEther("0.05") }
      );

      const attackJobId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("attack-job"));
      await escrow.connect(customer).createJob(attackJobId, metadataHash, duration, description, {
        value: reward,
      });

      await escrow.connect(machineSigner).acceptJob(attackJobId, attackMachineId);
      await escrow.connect(machineSigner).startExecution(attackJobId);

      const evidenceHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("evidence"));
      const block = await hre.ethers.provider.getBlock("latest");
      const timestamp = block!.timestamp + 1;
      const nonce = 55555n;

      const domain = {
        name: "MachinaPay JobEscrow",
        version: "1",
        chainId: (await hre.ethers.provider.getNetwork()).chainId,
        verifyingContract: await escrow.getAddress(),
      };

      const proofTypes = {
        Proof: [
          { name: "jobId", type: "bytes32" },
          { name: "machineId", type: "bytes32" },
          { name: "result", type: "uint8" },
          { name: "timestamp", type: "uint64" },
          { name: "nonce", type: "uint256" },
          { name: "evidenceHash", type: "bytes32" },
        ],
      };

      const proof = {
        jobId: attackJobId,
        machineId: attackMachineId,
        result: 1,
        timestamp,
        nonce,
        evidenceHash,
      };

      const proofSig = await machineSigner.signTypedData(domain, proofTypes, proof);
      await escrow.submitProof(proof, proofSig);

      const jobData = await escrow.getJob(attackJobId);

      const attestationTypes = {
        Attestation: [
          { name: "jobId", type: "bytes32" },
          { name: "machineId", type: "bytes32" },
          { name: "proofHash", type: "bytes32" },
          { name: "passed", type: "bool" },
          { name: "timestamp", type: "uint64" },
        ],
      };

      const attestation = {
        jobId: attackJobId,
        machineId: attackMachineId,
        proofHash: jobData.proofHash,
        passed: true,
        timestamp: (await hre.ethers.provider.getBlock("latest"))!.timestamp + 1,
      };

      const attestationSig = await verifier.signTypedData(domain, attestationTypes, attestation);
      await escrow.connect(verifier).submitAttestation(attestation, attestationSig);

      await receiver.arm(await escrow.getAddress(), attackJobId, false);

      // Expect release to revert with TransferFailed because the reentrant call reverts due to ReentrancyGuard
      await expect(escrow.release(attackJobId)).to.be.revertedWithCustomError(escrow, "TransferFailed");
    });
  });
});
