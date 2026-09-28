// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IMachineRegistry
/// @notice Minimal view of the MachineRegistry that JobEscrow depends on.
interface IMachineRegistry {
    /// @notice On-chain identity record of a machine.
    /// @param owner        Address that registered the machine (controls stake + deactivation).
    /// @param wallet       Address that receives job payments and may send machine transactions.
    /// @param signer       Address of the machine's signing key (signs EIP-712 proofs).
    /// @param stake        Native-token stake currently held for this machine (wei).
    /// @param reputation   Reputation score (starts at 100, +10 per success, -20 per failure, floor 0).
    /// @param registeredAt Block timestamp of registration.
    /// @param jobsCompleted Number of jobs settled successfully (paid).
    /// @param jobsFailed    Number of jobs rejected by the verifier.
    /// @param active       Whether the machine may accept new jobs.
    struct Machine {
        address owner;
        address wallet;
        address signer;
        uint256 stake;
        uint256 reputation;
        uint64 registeredAt;
        uint32 jobsCompleted;
        uint32 jobsFailed;
        bool active;
    }

    /// @notice Returns the machine record. Reverts if the machine is not registered.
    function getMachine(bytes32 machineId) external view returns (Machine memory);

    /// @notice True if the machineId has ever been registered (active or not).
    function isRegistered(bytes32 machineId) external view returns (bool);

    /// @notice True if the machine is registered AND active.
    function isActive(bytes32 machineId) external view returns (bool);

    /// @notice Called by JobEscrow only, to update reputation after a job outcome.
    function recordJobResult(bytes32 machineId, bool success) external;
}
