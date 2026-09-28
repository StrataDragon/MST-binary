// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IMachineRegistry} from "./interfaces/IMachineRegistry.sol";

/// @title MachineRegistry
/// @notice On-chain source of truth for MachinaPay machine identities.
/// @dev A machine is identified by a `bytes32` machineId (e.g. "M-042" encoded with
///      `ethers.encodeBytes32String("M-042")`). Each machine has three addresses:
///      - `owner`  : who registered it (manages stake, may deactivate)
///      - `wallet` : where job payments go / who may send machine-side transactions
///      - `signer` : the key that signs EIP-712 execution proofs
///      For the demo these can all be the same address.
///      The registry `owner()` (deployer) is an admin that may deactivate any machine
///      (kill switch). It cannot move any stake or escrowed funds.
contract MachineRegistry is IMachineRegistry, Ownable, ReentrancyGuard {
    // ------------------------------------------------------------------ constants
    uint256 public constant INITIAL_REPUTATION = 100;
    uint256 public constant SUCCESS_REPUTATION_GAIN = 10;
    uint256 public constant FAILURE_REPUTATION_LOSS = 20;

    // ------------------------------------------------------------------ storage
    /// @notice Minimum native-token stake required at registration (wei). May be 0.
    uint256 public immutable minStake;

    /// @notice The only address allowed to call `recordJobResult` (the JobEscrow). Set once.
    address public escrow;

    mapping(bytes32 machineId => Machine) private _machines;
    bytes32[] private _machineIds;

    // ------------------------------------------------------------------ events
    event MachineRegistered(
        bytes32 indexed machineId,
        address indexed owner,
        address indexed wallet,
        address signer,
        uint256 stake
    );
    event MachineDeactivated(bytes32 indexed machineId, address indexed by);
    event MachineStakeUpdated(bytes32 indexed machineId, uint256 oldStake, uint256 newStake);
    event MachineReputationUpdated(bytes32 indexed machineId, uint256 oldReputation, uint256 newReputation, bool success);
    event EscrowSet(address indexed escrow);

    // ------------------------------------------------------------------ errors
    error InvalidMachineId();
    error InvalidAddress();
    error MachineAlreadyRegistered(bytes32 machineId);
    error MachineNotFound(bytes32 machineId);
    error NotMachineOwnerOrAdmin(bytes32 machineId, address caller);
    error NotMachineOwner(bytes32 machineId, address caller);
    error MachineAlreadyInactive(bytes32 machineId);
    error MachineStillActive(bytes32 machineId);
    error InsufficientStake(uint256 provided, uint256 required);
    error NothingToWithdraw();
    error ZeroValue();
    error EscrowAlreadySet();
    error OnlyEscrow();
    error TransferFailed();

    // ------------------------------------------------------------------ constructor
    /// @param initialOwner Admin of the registry (can set escrow once, can deactivate machines).
    /// @param minStake_    Minimum registration stake in wei (0 disables the requirement).
    constructor(address initialOwner, uint256 minStake_) Ownable(initialOwner) {
        minStake = minStake_;
    }

    // ------------------------------------------------------------------ admin
    /// @notice Links the JobEscrow allowed to update reputation. Can be called exactly once.
    /// @param escrow_ Address of the deployed JobEscrow.
    function setEscrow(address escrow_) external onlyOwner {
        if (escrow != address(0)) revert EscrowAlreadySet();
        if (escrow_ == address(0)) revert InvalidAddress();
        escrow = escrow_;
        emit EscrowSet(escrow_);
    }

    // ------------------------------------------------------------------ machine lifecycle
    /// @notice Registers a new machine. `msg.value` becomes the machine's stake.
    /// @param machineId Non-zero identifier, e.g. encodeBytes32String("M-042").
    /// @param wallet    Payout / transaction wallet of the machine.
    /// @param signer    Address whose private key signs the machine's EIP-712 proofs.
    function registerMachine(bytes32 machineId, address wallet, address signer) external payable {
        if (machineId == bytes32(0)) revert InvalidMachineId();
        if (wallet == address(0) || signer == address(0)) revert InvalidAddress();
        if (_machines[machineId].owner != address(0)) revert MachineAlreadyRegistered(machineId);
        if (msg.value < minStake) revert InsufficientStake(msg.value, minStake);

        _machines[machineId] = Machine({
            owner: msg.sender,
            wallet: wallet,
            signer: signer,
            stake: msg.value,
            reputation: INITIAL_REPUTATION,
            registeredAt: uint64(block.timestamp),
            jobsCompleted: 0,
            jobsFailed: 0,
            active: true
        });
        _machineIds.push(machineId);

        emit MachineRegistered(machineId, msg.sender, wallet, signer, msg.value);
        if (msg.value > 0) emit MachineStakeUpdated(machineId, 0, msg.value);
        emit MachineReputationUpdated(machineId, 0, INITIAL_REPUTATION, true);
    }

    /// @notice Adds more stake to a machine. Only the machine owner.
    function topUpStake(bytes32 machineId) external payable {
        Machine storage m = _machines[machineId];
        if (m.owner == address(0)) revert MachineNotFound(machineId);
        if (m.owner != msg.sender) revert NotMachineOwner(machineId, msg.sender);
        if (msg.value == 0) revert ZeroValue();
        uint256 old = m.stake;
        m.stake = old + msg.value;
        emit MachineStakeUpdated(machineId, old, m.stake);
    }

    /// @notice Deactivates a machine so it cannot accept new jobs. Jobs already in flight continue.
    /// @dev Callable by the machine owner or the registry admin.
    function deactivateMachine(bytes32 machineId) external {
        Machine storage m = _machines[machineId];
        if (m.owner == address(0)) revert MachineNotFound(machineId);
        if (msg.sender != m.owner && msg.sender != owner()) revert NotMachineOwnerOrAdmin(machineId, msg.sender);
        if (!m.active) revert MachineAlreadyInactive(machineId);
        m.active = false;
        emit MachineDeactivated(machineId, msg.sender);
    }

    /// @notice Returns the stake to the machine owner. Only after the machine is deactivated.
    function withdrawStake(bytes32 machineId) external nonReentrant {
        Machine storage m = _machines[machineId];
        if (m.owner == address(0)) revert MachineNotFound(machineId);
        if (m.owner != msg.sender) revert NotMachineOwner(machineId, msg.sender);
        if (m.active) revert MachineStillActive(machineId);
        uint256 amount = m.stake;
        if (amount == 0) revert NothingToWithdraw();

        m.stake = 0; // effects before interaction
        emit MachineStakeUpdated(machineId, amount, 0);
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice Updates reputation after a job outcome. Only the linked JobEscrow.
    function recordJobResult(bytes32 machineId, bool success) external override {
        if (msg.sender != escrow) revert OnlyEscrow();
        Machine storage m = _machines[machineId];
        if (m.owner == address(0)) revert MachineNotFound(machineId);

        uint256 old = m.reputation;
        if (success) {
            m.reputation = old + SUCCESS_REPUTATION_GAIN;
            m.jobsCompleted += 1;
        } else {
            m.reputation = old > FAILURE_REPUTATION_LOSS ? old - FAILURE_REPUTATION_LOSS : 0;
            m.jobsFailed += 1;
        }
        emit MachineReputationUpdated(machineId, old, m.reputation, success);
    }

    // ------------------------------------------------------------------ views
    /// @inheritdoc IMachineRegistry
    function getMachine(bytes32 machineId) external view override returns (Machine memory) {
        Machine memory m = _machines[machineId];
        if (m.owner == address(0)) revert MachineNotFound(machineId);
        return m;
    }

    /// @inheritdoc IMachineRegistry
    function isRegistered(bytes32 machineId) external view override returns (bool) {
        return _machines[machineId].owner != address(0);
    }

    /// @inheritdoc IMachineRegistry
    function isActive(bytes32 machineId) external view override returns (bool) {
        return _machines[machineId].active;
    }

    /// @notice Wallet (payout address) of a machine. Reverts if unknown.
    function walletOf(bytes32 machineId) external view returns (address) {
        address w = _machines[machineId].wallet;
        if (w == address(0)) revert MachineNotFound(machineId);
        return w;
    }

    /// @notice Proof-signing address of a machine. Reverts if unknown.
    function signerOf(bytes32 machineId) external view returns (address) {
        address s = _machines[machineId].signer;
        if (s == address(0)) revert MachineNotFound(machineId);
        return s;
    }

    /// @notice Number of machines ever registered.
    function machineCount() external view returns (uint256) {
        return _machineIds.length;
    }

    /// @notice All registered machine IDs (fine for a demo-sized registry).
    function getMachineIds() external view returns (bytes32[] memory) {
        return _machineIds;
    }
}
