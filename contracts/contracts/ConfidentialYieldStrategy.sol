// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint64, euint128, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IConfidentialYieldStrategy} from "./interfaces/IConfidentialYieldStrategy.sol";

/// @notice Capital-based confidential yield strategy used by the prize vault.
/// @dev A funded reserve backs deterministic time-based yield accrual on Sepolia. The same
/// accounting boundary can be replaced by an ERC-4626/Aave adapter when confidential assets
/// can be routed into a compatible lending venue.
contract ConfidentialYieldStrategy is ZamaEthereumConfig, IConfidentialYieldStrategy, Ownable {
    uint32 public constant ANNUAL_RATE_BPS = 500;
    uint256 private constant BPS_DENOMINATOR = 10_000;
    uint256 private constant YEAR = 365 days;

    IERC7984 public immutable asset;
    address public vault;
    uint48 public lastAccrual;
    euint64 private _managedPrincipal;
    euint64 private _yieldReserve;
    euint64 private _accruedYield;

    error OnlyVault();
    error VaultAlreadySet();

    event VaultSet(address indexed vault);
    event PrincipalManaged(euint64 encryptedPrincipal);
    event YieldReserveFunded(address indexed funder, euint64 encryptedAmount);
    event YieldHarvested(address indexed vault, euint64 encryptedAmount);

    constructor(IERC7984 asset_) Ownable(msg.sender) {
        require(address(asset_) != address(0), "zero asset");
        asset = asset_;
        lastAccrual = uint48(block.timestamp);
        _managedPrincipal = FHE.asEuint64(0);
        _yieldReserve = FHE.asEuint64(0);
        _accruedYield = FHE.asEuint64(0);
        _persistAccounting();
    }

    function setVault(address vault_) external onlyOwner {
        if (vault != address(0)) revert VaultAlreadySet();
        require(vault_ != address(0), "zero vault");
        vault = vault_;
        emit VaultSet(vault_);
    }

    /// @inheritdoc IConfidentialYieldStrategy
    function deposit(euint64 amount) external {
        if (msg.sender != vault) revert OnlyVault();
        _accrue();
        _managedPrincipal = FHE.add(_managedPrincipal, amount);
        _persistAccounting();
        emit PrincipalManaged(_managedPrincipal);
    }

    /// @notice Funds the reserve that backs generated yield without exposing its size.
    function fundYieldReserve(externalEuint64 encryptedAmount, bytes calldata inputProof) external returns (euint64) {
        euint64 requested = FHE.fromExternal(encryptedAmount, inputProof);
        FHE.allowTransient(requested, address(asset));
        euint64 transferred = asset.confidentialTransferFrom(msg.sender, address(this), requested);
        _yieldReserve = FHE.add(_yieldReserve, transferred);
        _persistAccounting();
        FHE.allow(transferred, msg.sender);
        emit YieldReserveFunded(msg.sender, transferred);
        return transferred;
    }

    function withdraw(address to, euint64 amount) external returns (euint64 transferred) {
        if (msg.sender != vault) revert OnlyVault();
        _accrue();
        _managedPrincipal = FHE.sub(_managedPrincipal, amount);
        _persistAccounting();
        FHE.allowTransient(amount, address(asset));
        transferred = asset.confidentialTransfer(to, amount);
        FHE.allowTransient(transferred, msg.sender);
        emit PrincipalManaged(_managedPrincipal);
    }

    function harvest(address to) external returns (euint64 harvested) {
        if (msg.sender != vault) revert OnlyVault();
        _accrue();
        ebool reserveCoversAccrued = FHE.ge(_yieldReserve, _accruedYield);
        euint64 amount = FHE.select(reserveCoversAccrued, _accruedYield, _yieldReserve);
        _accruedYield = FHE.sub(_accruedYield, amount);
        _yieldReserve = FHE.sub(_yieldReserve, amount);
        _persistAccounting();
        FHE.allowTransient(amount, address(asset));
        harvested = asset.confidentialTransfer(to, amount);
        FHE.allowTransient(harvested, msg.sender);
        emit YieldHarvested(msg.sender, harvested);
    }

    function encryptedStrategyState() external view returns (euint64 principal, euint64 reserve, euint64 accrued) {
        return (_managedPrincipal, _yieldReserve, _accruedYield);
    }

    function _accrue() private {
        uint48 currentTime = uint48(block.timestamp);
        uint256 elapsed = currentTime - lastAccrual;
        if (elapsed == 0) return;

        euint128 annualized = FHE.mul(FHE.asEuint128(_managedPrincipal), uint128(ANNUAL_RATE_BPS * elapsed));
        euint128 earned = FHE.div(annualized, uint128(YEAR * BPS_DENOMINATOR));
        _accruedYield = FHE.add(_accruedYield, FHE.asEuint64(earned));
        lastAccrual = currentTime;
        _persistAccounting();
    }

    function _persistAccounting() private {
        FHE.allowThis(_managedPrincipal);
        FHE.allowThis(_yieldReserve);
        FHE.allowThis(_accruedYield);
    }
}
