// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {euint64} from "@fhevm/solidity/lib/FHE.sol";

interface IConfidentialYieldStrategy {
    function deposit(euint64 amount) external;

    function withdraw(address to, euint64 amount) external returns (euint64 transferred);
    function harvest(address to) external returns (euint64 harvested);
}
