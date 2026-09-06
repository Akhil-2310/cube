// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {euint64} from "@fhevm/solidity/lib/FHE.sol";

interface IConfidentialPrizePool {
    function contribute(euint64 amount) external;

    function reserve(euint64 amount) external returns (euint64 reserved);

    function pay(address winner, euint64 amount) external returns (euint64 transferred);
}
