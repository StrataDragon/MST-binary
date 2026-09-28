// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IMachineRegistry} from "./interfaces/IMachineRegistry.sol";

/// @title JobEscrow
/// @notice Escrow + settlement engine for MachinaPay. Rewards are paid in the chain's NATIVE token
///         (tMSTC on MST testnet). A job is settled only when BOTH:
///           1. the assigned machine's registered signer signed an EIP-712 `Proof`, and
///           2. the contract's authorised `verifier` signed an EIP-712 `Attestation` with passed=true.
///         Nobody (not the verifier, not the deployer) can move escrowed funds directly:
///         `release` always pays the machine wallet frozen at acceptance and `refund` always pays
///         the customer, and each can run only in the states described below.
///
/// State machine
///   createJob (payable)   -> FUNDED            (CREATED is reserved: creation and funding are atomic)
///   acceptJob             FUNDED    -> ACCEPTED
///   startExecution        ACCEPTED  -> EXECUTING
///   submitProof           EXECUTING -> PROOF_SUBMITTED
///   submitAttestation     PROOF_SUBMITTED -> VERIFIED           (verdict PASS)
///                         PROOF_SUBMITTED (verdict = FAIL)      (verdict FAIL, refundable immediately)
///   release               VERIFIED  -> PAID
///   refund                FUNDED / ACCEPTED / EXECUTING / PROOF_SUBMITTED -> REFUNDED (see `refund`)
contract JobEscrow is EIP712, ReentrancyGuard {
    // ------------------------------------------------------------------ types
    enum JobState {
        CREATED,          // 0 reserved (creation + funding are atomic, so jobs start at FUNDED)
        FUNDED,           // 1
        ACCEPTED,         // 2
        EXECUTING,        // 3
        PROOF_SUBMITTED,  // 4
        VERIFIED,         // 5
        PAID,             // 6
        REFUNDED          // 7
    }

    enum Verdict {
        NONE, // 0 no attestation yet
        PASS, // 1
        FAIL  // 2
    }

    enum RefundReason {
        CUSTOMER_CANCELLED,  // 0 customer cancelled an unaccepted job
        EXPIRED,             // 1 deadline passed
        VERIFICATION_FAILED  // 2 verifier attested FAIL
    }

    struct Job {
        address customer;
        address machineWallet; // payout address, frozen at acceptance
        bytes32 machineId;
        uint256 reward;        // wei of native token held in escrow for this job
        bytes32 metadataHash;  // keccak256 of the off-chain job description
        bytes32 proofHash;     // EIP-712 digest of the accepted Proof
        bytes32 evidenceHash;  // machine-reported evidence hash (from the Proof)
        uint256 proofNonce;    // machine nonce consumed by the accepted Proof
        uint64 createdAt;
        uint64 deadline;       // absolute unix time
        uint8 proofResult;     // result claimed by the machine (1 = success, 0 = failed)
        JobState state;
        Verdict verdict;
    }

    /// @notice Execution proof signed (EIP-712) by the machine's registered signer.
    struct Proof {
        bytes32 jobId;
        bytes32 machineId;
        uint8 result;          // 1 = task succeeded, 0 = task failed
        uint64 timestamp;      // unix seconds when the machine produced the proof
        uint256 nonce;         // unique per machine, never reusable
        bytes32 evidenceHash;  // hash of off-chain evidence (final position, logs, ...)
    }

    /// @notice Verification result signed (EIP-712) by the authorised verifier.
    struct Attestation {
        bytes32 jobId;
        bytes32 machineId;
        bytes32 proofHash;     // must equal the on-chain proofHash of the job
        bool passed;
        uint64 timestamp;      // unix seconds when the verifier signed
    }

    // ------------------------------------------------------------------ constants
    bytes32 public constant PROOF_TYPEHASH = keccak256(
        "Proof(bytes32 jobId,bytes32 machineId,uint8 result,uint64 timestamp,uint256 nonce,bytes32 evidenceHash)"
    );
    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "Attestation(bytes32 jobId,bytes32 machineId,bytes32 proofHash,bool passed,uint64 timestamp)"
    );

    uint8 public constant RESULT_FAILED = 0;
    uint8 public constant RESULT_SUCCESS = 1;

    /// @notice A signed proof/attestation is valid for this long after its `timestamp`.
    uint256 public constant SIGNATURE_TTL = 1 hours;
    /// @notice Tolerated clock skew for signatures timestamped in the future.
    uint256 public constant MAX_CLOCK_SKEW = 10 minutes;
    /// @notice Extra time after `deadline` during which a submitted proof may still be attested.
    uint256 public constant REVIEW_GRACE = 1 hours;
    uint256 public constant MAX_JOB_DURATION = 30 days;

    // ------------------------------------------------------------------ immutables / storage
    IMachineRegistry public immutable registry;
    /// @notice The only address whose attestations are accepted. Fixed at deployment.
    address public immutable verifier;

    /// @notice Sum of rewards currently held for unsettled jobs (wei).
    uint256 public totalLocked;

    mapping(bytes32 jobId => Job) private _jobs;
    bytes32[] private _jobIds;
    /// @dev machineId => nonce => used. Prevents any proof nonce from ever being reused by a machine.
    mapping(bytes32 machineId => mapping(uint256 nonce => bool)) public usedProofNonce;

    // ------------------------------------------------------------------ events
    event JobCreated(
        bytes32 indexed jobId,
        address indexed customer,
        uint256 reward,
        bytes32 metadataHash,
        uint64 deadline,
        string description
    );
    event JobFunded(bytes32 indexed jobId, address indexed customer, uint256 amount);
    event JobAccepted(bytes32 indexed jobId, bytes32 indexed machineId, address indexed machineWallet);
    event JobExecutionStarted(bytes32 indexed jobId, bytes32 indexed machineId);
    event ProofSubmitted(
        bytes32 indexed jobId,
        bytes32 indexed machineId,
        bytes32 indexed proofHash,
        bytes32 evidenceHash,
        uint8 result,
        uint64 timestamp,
        uint256 nonce
    );
    event VerificationSubmitted(
        bytes32 indexed jobId,
        bytes32 indexed machineId,
        address indexed verifier,
        bool passed,
        bytes32 proofHash
    );
    event JobVerified(bytes32 indexed jobId, bytes32 indexed machineId, bytes32 proofHash);
    event PaymentReleased(bytes32 indexed jobId, bytes32 indexed machineId, address indexed machineWallet, uint256 amount);
    event JobRefunded(bytes32 indexed jobId, address indexed customer, uint256 amount, RefundReason reason);

    // ------------------------------------------------------------------ errors
    error InvalidJobId();
    error InvalidAddress();
    error JobAlreadyExists(bytes32 jobId);
    error JobNotFound(bytes32 jobId);
    error ZeroReward();
    error InvalidDuration();
    error InvalidState(JobState current);
    error JobExpired(bytes32 jobId);
    error MachineNotRegistered(bytes32 machineId);
    error MachineInactive(bytes32 machineId);
    error NotMachineOperator(bytes32 machineId, address caller);
    error WrongMachine(bytes32 expected, bytes32 provided);
    error ProofTimestampInvalid();
    error ProofExpired();
    error NonceAlreadyUsed(bytes32 machineId, uint256 nonce);
    error InvalidMachineSignature();
    error InvalidVerifierSignature();
    error AttestationExpired();
    error ProofHashMismatch(bytes32 expected, bytes32 provided);
    error AttestationContradictsProof();
    error NotRefundable(bytes32 jobId);
    error TransferFailed();

    // ------------------------------------------------------------------ constructor
    /// @param registry_ Deployed MachineRegistry.
    /// @param verifier_ Address whose EIP-712 attestations authorise payment.
    constructor(IMachineRegistry registry_, address verifier_) EIP712("MachinaPay JobEscrow", "1") {
        if (address(registry_) == address(0) || verifier_ == address(0)) revert InvalidAddress();
        registry = registry_;
        verifier = verifier_;
    }

    // ================================================================== customer
    /// @notice Creates a job and locks `msg.value` (native token) as its reward in one step.
    /// @param jobId        Unique non-zero id chosen by the customer (e.g. keccak256 of a UUID).
    /// @param metadataHash keccak256(bytes(description)) by convention; binds the job to off-chain metadata.
    /// @param duration     Seconds from now until the job expires (1 .. 30 days).
    /// @param description  Human-readable description; emitted in the event only, NOT stored.
    function createJob(bytes32 jobId, bytes32 metadataHash, uint64 duration, string calldata description)
        external
        payable
    {
        if (jobId == bytes32(0)) revert InvalidJobId();
        if (_jobs[jobId].customer != address(0)) revert JobAlreadyExists(jobId);
        if (msg.value == 0) revert ZeroReward();
        if (duration == 0 || duration > MAX_JOB_DURATION) revert InvalidDuration();

        uint64 deadline = uint64(block.timestamp) + duration;
        Job storage job = _jobs[jobId];
        job.customer = msg.sender;
        job.reward = msg.value;
        job.metadataHash = metadataHash;
        job.createdAt = uint64(block.timestamp);
        job.deadline = deadline;
        job.state = JobState.FUNDED;
        _jobIds.push(jobId);
        totalLocked += msg.value;

        emit JobCreated(jobId, msg.sender, msg.value, metadataHash, deadline, description);
        emit JobFunded(jobId, msg.sender, msg.value);
    }

    // ================================================================== machine
    /// @notice A registered, active machine accepts a funded job. FUNDED -> ACCEPTED.
    /// @dev Caller must be the machine's owner, wallet or signer. The payout wallet is frozen here.
    function acceptJob(bytes32 jobId, bytes32 machineId) external {
        Job storage job = _getJob(jobId);
        if (job.state != JobState.FUNDED) revert InvalidState(job.state);
        if (block.timestamp > job.deadline) revert JobExpired(jobId);

        if (!registry.isRegistered(machineId)) revert MachineNotRegistered(machineId);
        IMachineRegistry.Machine memory m = registry.getMachine(machineId);
        if (!m.active) revert MachineInactive(machineId);
        _requireOperator(machineId, m);

        job.machineId = machineId;
        job.machineWallet = m.wallet;
        job.state = JobState.ACCEPTED;

        emit JobAccepted(jobId, machineId, m.wallet);
    }

    /// @notice The machine signals it has begun the task. ACCEPTED -> EXECUTING.
    function startExecution(bytes32 jobId) external {
        Job storage job = _getJob(jobId);
        if (job.state != JobState.ACCEPTED) revert InvalidState(job.state);
        if (block.timestamp > job.deadline) revert JobExpired(jobId);
        _requireOperator(job.machineId, registry.getMachine(job.machineId));

        job.state = JobState.EXECUTING;
        emit JobExecutionStarted(jobId, job.machineId);
    }

    /// @notice Submits the machine's signed execution proof. EXECUTING -> PROOF_SUBMITTED.
    /// @dev Anyone may relay this transaction: authority comes from the EIP-712 signature, which must be
    ///      produced by the signer registered for the job's machine. The signature covers jobId, machineId,
    ///      result, timestamp, nonce and evidenceHash under this contract's domain (chainId + address), so it
    ///      cannot be replayed on another job, another contract or another chain.
    /// @param proof     The proof payload.
    /// @param signature 65-byte ECDSA signature over the EIP-712 digest of `proof`.
    function submitProof(Proof calldata proof, bytes calldata signature) external {
        Job storage job = _getJob(proof.jobId);
        if (job.state != JobState.EXECUTING) revert InvalidState(job.state);
        if (block.timestamp > job.deadline) revert JobExpired(proof.jobId);
        if (proof.machineId != job.machineId) revert WrongMachine(job.machineId, proof.machineId);

        _checkFreshness(proof.timestamp, true);

        if (usedProofNonce[proof.machineId][proof.nonce]) revert NonceAlreadyUsed(proof.machineId, proof.nonce);

        bytes32 digest = hashProof(proof);
        (address recovered, ECDSA.RecoverError err, ) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || recovered != registry.getMachine(proof.machineId).signer) {
            revert InvalidMachineSignature();
        }

        usedProofNonce[proof.machineId][proof.nonce] = true;
        job.proofHash = digest;
        job.evidenceHash = proof.evidenceHash;
        job.proofNonce = proof.nonce;
        job.proofResult = proof.result;
        job.state = JobState.PROOF_SUBMITTED;

        emit ProofSubmitted(
            proof.jobId, proof.machineId, digest, proof.evidenceHash, proof.result, proof.timestamp, proof.nonce
        );
    }

    // ================================================================== verifier
    /// @notice Submits the verifier's signed verdict for a job's proof.
    /// @dev Anyone may relay it; only a signature by `verifier` is accepted.
    ///      passed = true  : PROOF_SUBMITTED -> VERIFIED (payment can now be released)
    ///      passed = false : verdict = FAIL, job stays PROOF_SUBMITTED and becomes immediately refundable
    ///                       (the machine's reputation is reduced).
    function submitAttestation(Attestation calldata att, bytes calldata signature) external {
        Job storage job = _getJob(att.jobId);
        if (job.state != JobState.PROOF_SUBMITTED || job.verdict != Verdict.NONE) revert InvalidState(job.state);
        if (block.timestamp > uint256(job.deadline) + REVIEW_GRACE) revert JobExpired(att.jobId);
        if (att.machineId != job.machineId) revert WrongMachine(job.machineId, att.machineId);
        if (att.proofHash != job.proofHash) revert ProofHashMismatch(job.proofHash, att.proofHash);

        _checkFreshness(att.timestamp, false);

        (address recovered, ECDSA.RecoverError err, ) = ECDSA.tryRecover(hashAttestation(att), signature);
        if (err != ECDSA.RecoverError.NoError || recovered != verifier) revert InvalidVerifierSignature();

        emit VerificationSubmitted(att.jobId, att.machineId, recovered, att.passed, att.proofHash);

        if (att.passed) {
            // The verifier may not pass a proof in which the machine itself reported failure.
            if (job.proofResult != RESULT_SUCCESS) revert AttestationContradictsProof();
            job.verdict = Verdict.PASS;
            job.state = JobState.VERIFIED;
            emit JobVerified(att.jobId, att.machineId, att.proofHash);
        } else {
            job.verdict = Verdict.FAIL;
            registry.recordJobResult(att.machineId, false);
        }
    }

    // ================================================================== settlement
    /// @notice Pays the reward to the machine wallet. VERIFIED -> PAID. Callable by anyone;
    ///         the destination is fixed (the wallet frozen at acceptance), so callers gain nothing.
    function release(bytes32 jobId) external nonReentrant {
        Job storage job = _getJob(jobId);
        if (job.state != JobState.VERIFIED) revert InvalidState(job.state);

        uint256 amount = job.reward;
        address to = job.machineWallet;
        bytes32 machineId = job.machineId;

        job.state = JobState.PAID; // effects before interaction
        totalLocked -= amount;

        registry.recordJobResult(machineId, true);

        (bool ok, ) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit PaymentReleased(jobId, machineId, to, amount);
    }

    /// @notice Returns the reward to the customer. -> REFUNDED. Allowed only when:
    ///   - FUNDED          : the customer cancels, or the deadline has passed (anyone)
    ///   - ACCEPTED/EXECUTING : the deadline has passed (anyone)
    ///   - PROOF_SUBMITTED : the verifier attested FAIL (anyone), or no attestation arrived within
    ///                       `deadline + REVIEW_GRACE` (anyone)
    ///   Never from VERIFIED (machine is owed payment), PAID or REFUNDED. Funds always go to the customer.
    function refund(bytes32 jobId) external nonReentrant {
        Job storage job = _getJob(jobId);
        JobState s = job.state;
        RefundReason reason;

        if (s == JobState.FUNDED) {
            if (msg.sender == job.customer) {
                reason = RefundReason.CUSTOMER_CANCELLED;
            } else if (block.timestamp > job.deadline) {
                reason = RefundReason.EXPIRED;
            } else {
                revert NotRefundable(jobId);
            }
        } else if (s == JobState.ACCEPTED || s == JobState.EXECUTING) {
            if (block.timestamp <= job.deadline) revert NotRefundable(jobId);
            reason = RefundReason.EXPIRED;
        } else if (s == JobState.PROOF_SUBMITTED) {
            if (job.verdict == Verdict.FAIL) {
                reason = RefundReason.VERIFICATION_FAILED;
            } else if (block.timestamp > uint256(job.deadline) + REVIEW_GRACE) {
                reason = RefundReason.EXPIRED;
            } else {
                revert NotRefundable(jobId);
            }
        } else {
            revert InvalidState(s); // VERIFIED, PAID, REFUNDED (CREATED is unreachable)
        }

        uint256 amount = job.reward;
        address customer = job.customer;

        job.state = JobState.REFUNDED; // effects before interaction
        totalLocked -= amount;

        (bool ok, ) = payable(customer).call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit JobRefunded(jobId, customer, amount, reason);
    }

    // ================================================================== views
    /// @notice Full job record. Reverts with JobNotFound for unknown ids.
    function getJob(bytes32 jobId) external view returns (Job memory) {
        return _getJob(jobId);
    }

    /// @notice Current state of a job. Reverts with JobNotFound for unknown ids.
    function getJobState(bytes32 jobId) external view returns (JobState) {
        return _getJob(jobId).state;
    }

    /// @notice True if the job exists.
    function jobExists(bytes32 jobId) external view returns (bool) {
        return _jobs[jobId].customer != address(0);
    }

    /// @notice Number of jobs ever created.
    function jobCount() external view returns (uint256) {
        return _jobIds.length;
    }

    /// @notice Paginated list of job ids in creation order.
    function getJobIds(uint256 offset, uint256 limit) external view returns (bytes32[] memory ids) {
        uint256 total = _jobIds.length;
        if (offset >= total) return new bytes32[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        ids = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            ids[i - offset] = _jobIds[i];
        }
    }

    /// @notice EIP-712 digest a machine must sign for `proof` (also stored as job.proofHash).
    function hashProof(Proof calldata proof) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    PROOF_TYPEHASH,
                    proof.jobId,
                    proof.machineId,
                    proof.result,
                    proof.timestamp,
                    proof.nonce,
                    proof.evidenceHash
                )
            )
        );
    }

    /// @notice EIP-712 digest the verifier must sign for `att`.
    function hashAttestation(Attestation calldata att) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(ATTESTATION_TYPEHASH, att.jobId, att.machineId, att.proofHash, att.passed, att.timestamp)
            )
        );
    }

    // ================================================================== internals
    function _getJob(bytes32 jobId) private view returns (Job storage job) {
        job = _jobs[jobId];
        if (job.customer == address(0)) revert JobNotFound(jobId);
    }

    function _requireOperator(bytes32 machineId, IMachineRegistry.Machine memory m) private view {
        if (msg.sender != m.wallet && msg.sender != m.signer && msg.sender != m.owner) {
            revert NotMachineOperator(machineId, msg.sender);
        }
    }

    /// @dev Rejects timestamps too far in the future or older than SIGNATURE_TTL.
    function _checkFreshness(uint64 timestamp, bool isProof) private view {
        if (uint256(timestamp) > block.timestamp + MAX_CLOCK_SKEW) {
            if (isProof) revert ProofTimestampInvalid();
            revert AttestationExpired();
        }
        if (block.timestamp > uint256(timestamp) + SIGNATURE_TTL) {
            if (isProof) revert ProofExpired();
            revert AttestationExpired();
        }
    }
}
