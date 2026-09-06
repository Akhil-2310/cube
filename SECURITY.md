# Security model

Cube is an unaudited testnet demonstration. Do not use it to custody assets with real value.

## Roles

- The vault owner may pause or unpause new deposits, direct prize contributions, and harvesting. The owner cannot block
  principal withdrawals or control winner selection.
- Any account may initialize the first fixed-duration draw, close an expired draw (which immediately opens its
  successor), harvest available yield, and advance settlement for a closed draw.
- Draw closure calls Zama's onchain encrypted CSPRNG. No owner, keeper, or offchain callback supplies the random value.
- A user must explicitly grant the vault and strategy time-limited ERC-7984 operator rights before confidential
  transfers.

For a value-bearing deployment, ownership should be transferred to a timelocked multisig.

## Core invariants

- Principal and prizes are separated: deposits are held by the strategy, while only harvested yield and sponsored
  contributions are held by the Prize Pool.
- Strategy yield is a deterministic function of encrypted managed principal, elapsed time, and a fixed rate, and can
  never exceed its encrypted funded reserve.
- A user's principal can be withdrawn in every draw state and while the vault is paused.
- Draw weight is frozen at the scheduled close. Encrypted balance observations let later deposits and withdrawals
  change the open draw without altering any closed draw's TWAB.
- Settlement is deterministic for the frozen encrypted TWAB state and encrypted FHE random tickets.
- Settlement reserves prizes; only a participant's later claim can transfer their encrypted zero-or-prize result.
- Winner and payout ciphertexts are authorized only for the vault and the corresponding participant.
- Insufficient withdrawals transfer encrypted zero, avoiding a balance-dependent public revert.
- Draw duration and encrypted integer widths bound TWAB arithmetic below `euint128` capacity.

## Known limitations

- `ConfidentialYieldStrategy` models yield at a fixed 5% annual rate against a separately funded encrypted reserve; it
  is not an integrated lending market. Production deployments must replace it with an audited yield-bearing adapter.
- Shielding test USDC into Zama's `cUSDCMock` exposes the clear wrapper amount. Confidentiality begins after wrapping.
- `cUSDCMock` is an external upgradeable protocol dependency. Its owner, pauser, deny-list behavior, upgrades, and
  availability are outside Cube's control and must be monitored as part of the deployment trust model.
- Address participation, transaction timing, gas usage, participant count, and draw lifecycle are public metadata and
  may enable correlation attacks.
- Draw transitions are permissionless, but FHE infrastructure failure can affect liveness.
- A claim transaction and its sender are public metadata even though the result and transferred amount remain encrypted.
- Settlement handles 16 accounts per transaction but enumerates every lifetime participant and searches that account's
  encrypted balance observations. A production system needs partitioning, bounded observation storage, or claim-based
  checks before supporting an unbounded user set.
- Contract source and randomness are publicly verifiable, but FHE execution and decryption rely on the Zama protocol's
  threshold infrastructure and trust assumptions.
- There are three hard-coded prize tiers rather than PoolTogether V5's adaptive tier-count economics and liquidation
  auctions. This preserves the prize-savings flow without reproducing the full V5 incentive market.

## Operational checklist

- Use a dedicated, minimally funded Sepolia deployer private key; never expose it through `NEXT_PUBLIC_*` variables or
  commit it to the repository.
- Verify every deployed address and constructor argument on a block explorer.
- Verify the official Zama `cUSDCMock` and underlying test-USDC addresses against the published Sepolia registry.
- Transfer ownership to a timelocked multisig.
- Monitor draw state, FHE execution, strategy solvency, ciphertext ACL errors, claims, and settlement progress.
- Exercise pause, withdrawal, failed close/settlement, rollover, and recovery procedures before launch.
- Obtain independent Solidity, FHE access-control, economic, frontend, and infrastructure reviews.

## Reporting

Until a dedicated disclosure channel exists, report vulnerabilities privately to the repository owner. Do not publish an
exploit against an active deployment before maintainers have had a reasonable opportunity to respond.
