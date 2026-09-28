// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev Tiny smoke-test contract: proves the target chain accepts our compiler output
///      (evm "paris") and that deployment + state-changing calls + events work.
contract Ping {
    uint256 public pings;
    event Pinged(address indexed by, uint256 count);

    function ping() external {
        pings += 1;
        emit Pinged(msg.sender, pings);
    }
}
