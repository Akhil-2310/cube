// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint64, euint128, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IConfidentialYieldStrategy} from "./interfaces/IConfidentialYieldStrategy.sol";
import {IConfidentialPrizePool} from "./interfaces/IConfidentialPrizePool.sol";

/// @title Confidential Prize Vault
/// @notice PoolTogether-style prize savings with encrypted balances, TWAB and payouts.
/// @dev Participant addresses and transaction timing remain public; all financial values are encrypted.
contract ConfidentialPrizeVault is ZamaEthereumConfig, Ownable, Pausable, ReentrancyGuard {
    enum DrawState {
        None,
        Open,
        Ready,
        Settled
    }

    struct Position {
        euint64 principal;
        euint128 accruedTwab;
        uint48 checkpoint;
        uint64 drawId;
        bool registered;
    }

    /// @dev Balance-change observations let closed draws use their historical TWAB
    /// while later draws continue accepting deposits and withdrawals.
    struct Observation {
        uint48 timestamp;
        euint64 balance;
        euint128 cumulative;
    }

    struct Draw {
        uint48 openedAt;
        uint48 closesAt;
        uint32 processed;
        uint32 participantCount;
        DrawState state;
        euint128 totalTwab;
        euint128 cursor;
        euint128[3] tickets;
        euint64 prize;
        euint64[3] tierPrizes;
        ebool[3] winnersFound;
    }

    uint8 public constant TIER_COUNT = 3;
    uint48 public constant MIN_DRAW_DURATION = 5 minutes;
    uint48 public constant MAX_DRAW_DURATION = 30 days;
    uint32 public constant MAX_SETTLEMENT_BATCH = 16;

    IERC7984 public immutable asset;
    IConfidentialYieldStrategy public immutable yieldStrategy;
    IConfidentialPrizePool public immutable prizePool;
    uint48 public immutable drawDuration;

    uint64 public currentDrawId;
    uint64 public oldestPendingDrawId;
    uint64 public latestSettledDrawId;
    address[] private _participants;
    mapping(address account => Position position) private _positions;
    mapping(address account => Observation[] observations) private _observations;
    Observation[] private _totalObservations;
    mapping(uint64 drawId => Draw draw) private _draws;
    mapping(uint64 drawId => mapping(address account => ebool won)) private _won;
    mapping(uint64 drawId => mapping(address account => euint64 payout)) private _payouts;
    mapping(uint64 drawId => mapping(address account => bool ready)) private _resultReady;
    mapping(uint64 drawId => mapping(address account => bool claimed)) public claimed;

    euint64 private _totalPrincipal;
    euint64 private _rolloverPrize;

    error DrawNotOpen();
    error DrawStillOpen();
    error InvalidDrawState();
    error InvalidBatchSize();
    error InvalidTier();
    error AlreadyClaimed();
    error NotParticipant();

    event DrawOpened(uint64 indexed drawId, uint48 openedAt, uint48 closesAt);
    event DrawFunded(uint64 indexed drawId, address indexed contributor, euint64 encryptedAmount);
    event YieldHarvested(uint64 indexed drawId, euint64 encryptedAmount);
    event Deposited(uint64 indexed drawId, address indexed account, euint64 encryptedAmount);
    event Withdrawn(address indexed account, euint64 encryptedAmount);
    event DrawClosed(uint64 indexed drawId);
    event EncryptedTicketsGenerated(uint64 indexed drawId);
    event TierOpened(uint64 indexed drawId, uint8 indexed tier, euint64 encryptedPrize);
    event SettlementProgress(uint64 indexed drawId, uint32 processed, uint32 participantCount);
    event DrawSettled(uint64 indexed drawId);
    event PrizeClaimed(uint64 indexed drawId, address indexed account, euint64 encryptedAmount);

    constructor(
        IERC7984 asset_,
        IConfidentialYieldStrategy yieldStrategy_,
        IConfidentialPrizePool prizePool_,
        uint48 drawDuration_
    ) Ownable(msg.sender) {
        require(address(asset_) != address(0), "zero asset");
        require(address(yieldStrategy_) != address(0), "zero yield strategy");
        require(address(prizePool_) != address(0), "zero prize pool");
        require(drawDuration_ >= MIN_DRAW_DURATION && drawDuration_ <= MAX_DRAW_DURATION, "invalid draw duration");
        asset = asset_;
        yieldStrategy = yieldStrategy_;
        prizePool = prizePool_;
        drawDuration = drawDuration_;

        _totalPrincipal = FHE.asEuint64(0);
        _rolloverPrize = FHE.asEuint64(0);
        FHE.allowThis(_totalPrincipal);
        FHE.allowThis(_rolloverPrize);
    }

    /// @notice Opens the next fixed-duration draw. Anyone may advance the protocol lifecycle.
    function openDraw() external whenNotPaused {
        if (currentDrawId != 0) revert InvalidDrawState();
        _openNextDraw(uint48(block.timestamp));
    }

    /// @notice Pull confidential assets after the user grants this vault ERC-7984 operator rights.
    function deposit(externalEuint64 encryptedAmount, bytes calldata inputProof) external nonReentrant whenNotPaused {
        if (currentDrawId == 0) revert DrawNotOpen();
        Draw storage draw = _draws[currentDrawId];
        _checkpointPosition(msg.sender, draw);

        Position storage position = _positions[msg.sender];
        if (!position.registered) {
            position.registered = true;
            _participants.push(msg.sender);
        }

        euint64 requested = FHE.fromExternal(encryptedAmount, inputProof);
        FHE.allowTransient(requested, address(asset));
        euint64 transferred = asset.confidentialTransferFrom(msg.sender, address(yieldStrategy), requested);
        FHE.allowTransient(transferred, address(yieldStrategy));
        yieldStrategy.deposit(transferred);
        position.principal = FHE.add(position.principal, transferred);
        _totalPrincipal = FHE.add(_totalPrincipal, transferred);
        _persistPosition(position, msg.sender);
        FHE.allowThis(_totalPrincipal);
        _recordObservation(_observations[msg.sender], position.principal);
        _recordObservation(_totalObservations, _totalPrincipal);

        emit Deposited(currentDrawId, msg.sender, transferred);
    }

    /// @notice Withdraw confidential principal at any time, including while a draw is settling.
    /// @dev Insufficient requests transfer encrypted zero instead of leaking the balance through a revert.
    function withdraw(externalEuint64 encryptedAmount, bytes calldata inputProof) external nonReentrant {
        euint64 requested = FHE.fromExternal(encryptedAmount, inputProof);
        Position storage position = _positions[msg.sender];

        if (currentDrawId != 0) {
            Draw storage draw = _draws[currentDrawId];
            _checkpointPosition(msg.sender, draw);
        }

        ebool sufficient = FHE.ge(position.principal, requested);
        euint64 amount = FHE.select(sufficient, requested, FHE.asEuint64(0));
        position.principal = FHE.sub(position.principal, amount);
        _totalPrincipal = FHE.sub(_totalPrincipal, amount);
        _persistPosition(position, msg.sender);
        FHE.allowThis(_totalPrincipal);
        if (position.registered) {
            _recordObservation(_observations[msg.sender], position.principal);
            _recordObservation(_totalObservations, _totalPrincipal);
        }

        FHE.allowTransient(amount, address(yieldStrategy));
        euint64 transferred = yieldStrategy.withdraw(msg.sender, amount);
        FHE.allowThis(transferred);
        FHE.allow(transferred, msg.sender);

        emit Withdrawn(msg.sender, transferred);
    }

    /// @notice Adds harvested yield or sponsored prize liquidity without revealing its amount.
    function contributePrize(
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external nonReentrant whenNotPaused {
        Draw storage draw = _openDraw();
        euint64 requested = FHE.fromExternal(encryptedAmount, inputProof);
        FHE.allowTransient(requested, address(asset));
        euint64 transferred = asset.confidentialTransferFrom(msg.sender, address(prizePool), requested);
        FHE.allowTransient(transferred, address(prizePool));
        prizePool.contribute(transferred);
        draw.prize = FHE.add(draw.prize, transferred);
        FHE.allowThis(draw.prize);
        emit DrawFunded(currentDrawId, msg.sender, transferred);
    }

    /// @notice Pulls accumulated strategy yield into the encrypted prize liquidity for this draw.
    function harvestYield() external nonReentrant whenNotPaused {
        Draw storage draw = _openDraw();
        _harvestIntoDraw(currentDrawId, draw);
    }

    /// @notice Freezes TWAB and generates encrypted, deposit-weighted tickets fully onchain.
    function closeDraw() external nonReentrant {
        uint64 closingDrawId = currentDrawId;
        Draw storage draw = _draws[closingDrawId];
        if (draw.state != DrawState.Open) revert DrawNotOpen();
        if (block.timestamp < draw.closesAt) revert DrawStillOpen();

        // Sweep remaining strategy yield before sizing prizes. This keeps
        // scheduled closes self-contained even when no manual harvest ran.
        _harvestIntoDraw(closingDrawId, draw);
        draw.totalTwab = _twabBetween(_totalObservations, draw.openedAt, draw.closesAt);
        draw.participantCount = uint32(_participants.length);
        FHE.allowThis(draw.totalTwab);

        draw.tierPrizes[0] = FHE.div(FHE.mul(draw.prize, uint64(50)), uint64(100));
        draw.tierPrizes[1] = FHE.div(FHE.mul(draw.prize, uint64(30)), uint64(100));
        draw.tierPrizes[2] = FHE.sub(FHE.sub(draw.prize, draw.tierPrizes[0]), draw.tierPrizes[1]);

        // Scale three independent encrypted 32-bit CSPRNG values into [0, totalTWAB).
        // totalTWAB is bounded below 2^86, so each 128-bit product cannot overflow.
        for (uint8 tier = 0; tier < TIER_COUNT; tier++) {
            euint128 randomFraction = FHE.asEuint128(FHE.randEuint32());
            draw.tickets[tier] = FHE.shr(FHE.mul(draw.totalTwab, randomFraction), 32);
            FHE.allowThis(draw.tickets[tier]);
            FHE.allowThis(draw.tierPrizes[tier]);
            emit TierOpened(closingDrawId, tier, draw.tierPrizes[tier]);
        }

        draw.state = DrawState.Ready;
        if (oldestPendingDrawId == 0) oldestPendingDrawId = closingDrawId;
        emit DrawClosed(closingDrawId);
        emit EncryptedTicketsGenerated(closingDrawId);

        // The next accounting period starts at the scheduled boundary immediately;
        // settlement for the closed draw happens independently.
        _openNextDraw(draw.closesAt);
    }

    /// @notice Settles a bounded set of participants, keeping gas and FHE work predictable.
    function settleBatch(uint64 drawId, uint32 batchSize) external nonReentrant {
        if (batchSize == 0 || batchSize > MAX_SETTLEMENT_BATCH) revert InvalidBatchSize();
        Draw storage draw = _draws[drawId];
        if (draw.state != DrawState.Ready) revert InvalidDrawState();

        uint32 count = draw.participantCount;
        uint32 end = draw.processed + batchSize;
        if (end > count) end = count;

        euint128 cursor = draw.cursor;
        ebool[3] memory winnersFound = draw.winnersFound;
        for (uint32 i = draw.processed; i < end; i++) {
            (cursor, winnersFound) = _settleAccount(drawId, draw, _participants[i], cursor, winnersFound);
        }

        draw.processed = end;
        draw.cursor = cursor;
        FHE.allowThis(draw.cursor);
        for (uint8 tier = 0; tier < TIER_COUNT; tier++) {
            draw.winnersFound[tier] = winnersFound[tier];
            FHE.allowThis(draw.winnersFound[tier]);
        }

        emit SettlementProgress(drawId, end, count);
        if (end == count) {
            _finalizeDraw(drawId, draw, winnersFound);
        }
    }

    /// @notice Claims the caller's encrypted zero-or-prize result after local EIP-712 decryption.
    function claim(uint64 drawId) external nonReentrant returns (euint64 transferred) {
        if (!_resultReady[drawId][msg.sender]) revert NotParticipant();
        if (_draws[drawId].state != DrawState.Settled) revert InvalidDrawState();
        if (claimed[drawId][msg.sender]) revert AlreadyClaimed();
        claimed[drawId][msg.sender] = true;

        euint64 payout = _payouts[drawId][msg.sender];
        FHE.allowTransient(payout, address(prizePool));
        transferred = prizePool.pay(msg.sender, payout);
        FHE.allowThis(transferred);
        FHE.allow(transferred, msg.sender);
        emit PrizeClaimed(drawId, msg.sender, transferred);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function participantCount() external view returns (uint256) {
        return _participants.length;
    }

    function participantAt(uint256 index) external view returns (address) {
        return _participants[index];
    }

    function drawInfo(uint64 drawId) external view returns (uint48, uint48, uint32, DrawState) {
        Draw storage draw = _draws[drawId];
        return (draw.openedAt, draw.closesAt, draw.processed, draw.state);
    }

    function encryptedDrawState(uint64 drawId) external view returns (euint128, euint128, euint64) {
        Draw storage draw = _draws[drawId];
        return (draw.totalTwab, draw.cursor, draw.prize);
    }

    function encryptedTierState(uint64 drawId, uint8 tier) external view returns (euint128, euint64, ebool) {
        if (tier >= TIER_COUNT) revert InvalidTier();
        Draw storage draw = _draws[drawId];
        return (draw.tickets[tier], draw.tierPrizes[tier], draw.winnersFound[tier]);
    }

    function myPosition() external view returns (euint64 principal, euint128 accruedTwab) {
        Position storage position = _positions[msg.sender];
        return (position.principal, position.accruedTwab);
    }

    function myDrawResult(uint64 drawId) external view returns (ebool won, euint64 payout) {
        return (_won[drawId][msg.sender], _payouts[drawId][msg.sender]);
    }

    function encryptedTotalPrincipal() external view returns (euint64) {
        return _totalPrincipal;
    }

    function _openDraw() private view returns (Draw storage draw) {
        draw = _draws[currentDrawId];
        if (draw.state != DrawState.Open || block.timestamp >= draw.closesAt) revert DrawNotOpen();
    }

    function _harvestIntoDraw(uint64 drawId, Draw storage draw) private {
        euint64 harvested = yieldStrategy.harvest(address(prizePool));
        FHE.allowTransient(harvested, address(prizePool));
        prizePool.contribute(harvested);
        draw.prize = FHE.add(draw.prize, harvested);
        FHE.allowThis(draw.prize);
        emit YieldHarvested(drawId, harvested);
    }

    function _checkpointPosition(address account, Draw storage draw) private {
        Position storage position = _positions[account];
        uint48 end = uint48(block.timestamp);
        if (end > draw.closesAt) end = draw.closesAt;

        if (position.drawId != currentDrawId) {
            position.drawId = currentDrawId;
            position.accruedTwab = _twabBetween(_observations[account], draw.openedAt, end);
            position.checkpoint = end;
        }

        if (end > position.checkpoint) {
            uint128 elapsed = uint128(end - position.checkpoint);
            euint128 interval = FHE.mul(FHE.asEuint128(position.principal), elapsed);
            position.accruedTwab = FHE.add(position.accruedTwab, interval);
            position.checkpoint = end;
        }
        _persistPosition(position, account);
    }

    function _weightAtClose(address account, Draw storage draw) private returns (euint128 weight) {
        weight = _twabBetween(_observations[account], draw.openedAt, draw.closesAt);
    }

    function _tierResult(
        Draw storage draw,
        uint8 tier,
        euint128 cursor,
        euint128 nextCursor
    ) private returns (ebool isWinner, euint64 payout) {
        ebool inLowerBound = FHE.le(cursor, draw.tickets[tier]);
        ebool inUpperBound = FHE.lt(draw.tickets[tier], nextCursor);
        isWinner = FHE.and(inLowerBound, inUpperBound);
        payout = FHE.select(isWinner, draw.tierPrizes[tier], FHE.asEuint64(0));
    }

    function _settleAccount(
        uint64 drawId,
        Draw storage draw,
        address account,
        euint128 cursor,
        ebool[3] memory winnersFound
    ) private returns (euint128 nextCursor, ebool[3] memory updatedWinners) {
        nextCursor = FHE.add(cursor, _weightAtClose(account, draw));
        ebool accountWon = FHE.asEbool(false);
        euint64 payout = FHE.asEuint64(0);
        updatedWinners = winnersFound;

        for (uint8 tier = 0; tier < TIER_COUNT; tier++) {
            (ebool isWinner, euint64 tierPayout) = _tierResult(draw, tier, cursor, nextCursor);
            payout = FHE.add(payout, tierPayout);
            accountWon = FHE.or(accountWon, isWinner);
            updatedWinners[tier] = FHE.or(updatedWinners[tier], isWinner);
        }

        FHE.allowTransient(payout, address(prizePool));
        euint64 reserved = prizePool.reserve(payout);
        _won[drawId][account] = accountWon;
        _payouts[drawId][account] = reserved;
        _resultReady[drawId][account] = true;
        FHE.allowThis(accountWon);
        FHE.allow(accountWon, account);
        FHE.allowThis(reserved);
        FHE.allow(reserved, account);
    }

    function _finalizeDraw(uint64 drawId, Draw storage draw, ebool[3] memory winnersFound) private {
        euint64 unawarded = FHE.asEuint64(0);
        for (uint8 tier = 0; tier < TIER_COUNT; tier++) {
            euint64 tierRollover = FHE.select(FHE.not(winnersFound[tier]), draw.tierPrizes[tier], FHE.asEuint64(0));
            unawarded = FHE.add(unawarded, tierRollover);
        }
        Draw storage openDraw_ = _draws[currentDrawId];
        if (openDraw_.state == DrawState.Open && block.timestamp < openDraw_.closesAt) {
            openDraw_.prize = FHE.add(openDraw_.prize, unawarded);
            FHE.allowThis(openDraw_.prize);
        } else {
            _rolloverPrize = FHE.add(_rolloverPrize, unawarded);
            FHE.allowThis(_rolloverPrize);
        }
        draw.state = DrawState.Settled;
        if (drawId > latestSettledDrawId) latestSettledDrawId = drawId;
        if (drawId == oldestPendingDrawId) {
            uint64 candidate = drawId + 1;
            while (candidate < currentDrawId && _draws[candidate].state == DrawState.Settled) candidate++;
            oldestPendingDrawId = candidate < currentDrawId ? candidate : 0;
        }
        emit DrawSettled(drawId);
    }

    function _openNextDraw(uint48 openedAt) private {
        currentDrawId++;
        Draw storage draw = _draws[currentDrawId];
        draw.openedAt = openedAt;
        draw.closesAt = openedAt + drawDuration;
        draw.state = DrawState.Open;
        draw.prize = _rolloverPrize;
        draw.totalTwab = FHE.asEuint128(0);
        draw.cursor = FHE.asEuint128(0);
        for (uint8 tier = 0; tier < TIER_COUNT; tier++) {
            draw.tickets[tier] = FHE.asEuint128(0);
            draw.tierPrizes[tier] = FHE.asEuint64(0);
            draw.winnersFound[tier] = FHE.asEbool(false);
            FHE.allowThis(draw.tickets[tier]);
            FHE.allowThis(draw.tierPrizes[tier]);
            FHE.allowThis(draw.winnersFound[tier]);
        }

        _rolloverPrize = FHE.asEuint64(0);
        FHE.allowThis(draw.prize);
        FHE.allowThis(draw.totalTwab);
        FHE.allowThis(draw.cursor);
        FHE.allowThis(_rolloverPrize);
        emit DrawOpened(currentDrawId, draw.openedAt, draw.closesAt);
    }

    function _recordObservation(Observation[] storage observations, euint64 balance) private {
        uint48 timestamp = uint48(block.timestamp);
        euint128 cumulative = FHE.asEuint128(0);
        uint256 length = observations.length;
        if (length != 0) {
            Observation storage previous = observations[length - 1];
            cumulative = previous.cumulative;
            if (timestamp > previous.timestamp) {
                cumulative = FHE.add(
                    cumulative,
                    FHE.mul(FHE.asEuint128(previous.balance), uint128(timestamp - previous.timestamp))
                );
            }
            if (timestamp == previous.timestamp) {
                previous.balance = balance;
                previous.cumulative = cumulative;
                FHE.allowThis(previous.balance);
                FHE.allowThis(previous.cumulative);
                return;
            }
        }

        observations.push(Observation({timestamp: timestamp, balance: balance, cumulative: cumulative}));
        Observation storage observation = observations[observations.length - 1];
        FHE.allowThis(observation.balance);
        FHE.allowThis(observation.cumulative);
    }

    function _twabBetween(Observation[] storage observations, uint48 start, uint48 end) private returns (euint128) {
        return FHE.sub(_cumulativeAt(observations, end), _cumulativeAt(observations, start));
    }

    function _cumulativeAt(Observation[] storage observations, uint48 timestamp) private returns (euint128) {
        uint256 length = observations.length;
        for (uint256 i = length; i > 0; i--) {
            Observation storage observation = observations[i - 1];
            if (observation.timestamp <= timestamp) {
                return
                    FHE.add(
                        observation.cumulative,
                        FHE.mul(FHE.asEuint128(observation.balance), uint128(timestamp - observation.timestamp))
                    );
            }
        }
        return FHE.asEuint128(0);
    }

    function _persistPosition(Position storage position, address account) private {
        FHE.allowThis(position.principal);
        FHE.allow(position.principal, account);
        FHE.allowThis(position.accruedTwab);
        FHE.allow(position.accruedTwab, account);
    }
}
