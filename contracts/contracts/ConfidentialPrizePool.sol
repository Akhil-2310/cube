// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IConfidentialPrizePool} from "./interfaces/IConfidentialPrizePool.sol";

/// @title Confidential Prize Pool
/// @notice Holds encrypted prize liquidity separately from depositor principal and disburses vault-authorized prizes.
contract ConfidentialPrizePool is ZamaEthereumConfig, IConfidentialPrizePool, Ownable {
    IERC7984 public immutable asset;
    address public vault;
    euint64 private _availableLiquidity;

    error OnlyVault();
    error VaultAlreadySet();

    event VaultSet(address indexed vault);
    event PrizeLiquidityContributed(euint64 encryptedAmount);
    event PrizeReserved(euint64 encryptedAmount);
    event PrizePaid(address indexed recipient, euint64 encryptedAmount);

    constructor(IERC7984 asset_) Ownable(msg.sender) {
        require(address(asset_) != address(0), "zero asset");
        asset = asset_;
        _availableLiquidity = FHE.asEuint64(0);
        FHE.allowThis(_availableLiquidity);
    }

    function setVault(address vault_) external onlyOwner {
        if (vault != address(0)) revert VaultAlreadySet();
        require(vault_ != address(0), "zero vault");
        vault = vault_;
        emit VaultSet(vault_);
    }

    function contribute(euint64 amount) external {
        if (msg.sender != vault) revert OnlyVault();
        _availableLiquidity = FHE.add(_availableLiquidity, amount);
        FHE.allowThis(_availableLiquidity);
        emit PrizeLiquidityContributed(amount);
    }

    function reserve(euint64 amount) external returns (euint64 reserved) {
        if (msg.sender != vault) revert OnlyVault();
        _availableLiquidity = FHE.sub(_availableLiquidity, amount);
        FHE.allowThis(_availableLiquidity);
        FHE.allowTransient(amount, msg.sender);
        emit PrizeReserved(amount);
        return amount;
    }

    function pay(address winner, euint64 amount) external returns (euint64 transferred) {
        if (msg.sender != vault) revert OnlyVault();
        FHE.allowTransient(amount, address(asset));
        transferred = asset.confidentialTransfer(winner, amount);
        FHE.allowTransient(transferred, msg.sender);
        emit PrizePaid(winner, transferred);
    }

    function encryptedAvailableLiquidity() external view returns (euint64) {
        return _availableLiquidity;
    }
}
