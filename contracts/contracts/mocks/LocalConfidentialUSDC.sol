// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
// solhint-disable-next-line max-line-length
import {ERC7984ERC20Wrapper} from "@openzeppelin/confidential-contracts/token/ERC7984/extensions/ERC7984ERC20Wrapper.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Local FHE test fixture. Sepolia uses Zama's deployed cUSDCMock wrapper.
contract LocalConfidentialUSDC is ERC7984ERC20Wrapper, ZamaEthereumConfig {
    constructor(
        IERC20 underlying
    )
        ERC7984("Local Confidential USDC", "cUSDCMock", "https://example.invalid/local-cusdc.json")
        ERC7984ERC20Wrapper(underlying)
    {}
}
