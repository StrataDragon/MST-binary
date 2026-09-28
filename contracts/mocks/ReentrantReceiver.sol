// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev TEST-ONLY. A wallet contract that tries to re-enter JobEscrow when it receives ether.
///      Never deployed by scripts/deploy.ts.
interface IEscrowLike {
    function release(bytes32 jobId) external;
    function refund(bytes32 jobId) external;
}

contract ReentrantReceiver {
    IEscrowLike public escrow;
    bytes32 public jobId;
    bool public attackRefund;
    bool public reentered;

    function arm(address escrow_, bytes32 jobId_, bool attackRefund_) external {
        escrow = IEscrowLike(escrow_);
        jobId = jobId_;
        attackRefund = attackRefund_;
    }

    receive() external payable {
        reentered = true;
        if (attackRefund) {
            escrow.refund(jobId);
        } else {
            escrow.release(jobId);
        }
    }

    /// @dev Lets this contract act as a customer/machine owner in tests.
    function call(address target, bytes calldata data) external payable returns (bytes memory) {
        (bool ok, bytes memory ret) = target.call{value: msg.value}(data);
        require(ok, "call failed");
        return ret;
    }
}
