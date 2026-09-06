# Cube

Cube is a confidential no-loss prize-savings dApp for Ethereum Sepolia. It preserves PoolTogether's core mechanic:
users deposit principal, pooled capital generates yield, periodic deposit-weighted draws award only that yield, and
principal remains withdrawable. Zama FHEVM keeps balances, TWAB weights, random tickets, results, and payouts encrypted
onchain.

> Cube is an unaudited testnet demonstration. Its strategy models yield at a fixed 5% annual rate against an
> admin/user-funded encrypted reserve. A real deployment would replace that strategy with an audited lending adapter.

```text
pool/
├── contracts/   # Hardhat, Solidity, deployment, and FHE mock tests
└── frontend/    # Next.js, RainbowKit, wagmi, ethers, and Zama relayer SDK
```

## Architecture

```mermaid
flowchart LR
    U[Depositor] -->|wrap public test USDC| T[Zama cUSDCMock / ERC-7984]
    U -->|encrypted deposit| V[ConfidentialPrizeVault]
    V -->|encrypted principal| S[ConfidentialYieldStrategy]
    S -->|encrypted accrued yield| P[ConfidentialPrizePool]
    V -->|FHE.randEuint32| R[Encrypted tier tickets]
    R -->|encrypted TWAB selection| V
    V -->|reserve encrypted result| P
    U -->|EIP-712 user decryption then claim| V
    P -->|confidential payout| U
    S -->|principal withdrawal| U
```

| Component | Responsibility |
| --- | --- |
| `ConfidentialPrizeVault` | Encrypted principal/TWAB accounting, FHE randomness, weighted selection, claims, and withdrawals |
| `ConfidentialPrizePool` | Separate encrypted prize custody, reservation at settlement, and confidential claim payments |
| `ConfidentialYieldStrategy` | Encrypted principal custody, reserve-backed mock yield, harvest, and withdrawals |
| Zama `cUSDCMock` | Existing Sepolia ERC-7984 confidential wrapper; Cube does not deploy a new confidential token |
| `frontend` | RainbowKit wallet UX, encrypted inputs, EIP-712 user decryption, claims, and keeper controls |

## End-to-end flow

1. Anyone opens the first five-minute draw.
2. A user mints public test USDC, approves and wraps it into Zama's `cUSDCMock`, and grants time-limited ERC-7984
   operator access to the vault and strategy.
3. The browser encrypts the deposit for the vault. Principal moves to the strategy and the vault updates encrypted
   principal and time-weighted-average-balance observations.
4. A sponsor funds the encrypted mock-yield reserve. Yield accrues from encrypted managed principal and time; anyone
   can harvest the accrued amount into the separate Prize Pool.
5. Once the interval expires, anyone calls `closeDraw()`. In that transaction the contract freezes encrypted total
   TWAB and calls `FHE.randEuint32()` three times. Each encrypted random fraction is scaled into `[0, totalTWAB)` using
   encrypted multiplication and shifting. Neither randomness nor balances are sent offchain or revealed.
6. Closing immediately opens the next interval, so deposits and withdrawals do not wait for settlement.
7. A keeper calls `settleBatch(drawId, 16)` until all registered accounts are processed. Each of the 50%/30%/20%
   tiers independently selects an encrypted TWAB-weighted interval. Results are encrypted zero-or-prize values.
8. A participant signs the Zama relayer's EIP-712 user-decryption request to privately see their result. They then
   call `claim(drawId)`; the Prize Pool makes a confidential ERC-7984 transfer of that already-reserved result.
9. `withdraw()` remains available in every draw state and while paused. An excessive request becomes encrypted zero,
   avoiding a balance-dependent public revert.

Multiple tiers may choose the same participant in one draw. If a draw has no positive TWAB, its unawarded
encrypted prize rolls into the next open draw.

## Local development

Use Node.js 22 LTS; Hardhat does not support Node 23.

```bash
cd contracts
npm install
npm run compile
npm test
npm run lint

cd ../frontend
npm install
npm run lint
npm run build
```

For a local node, use separate terminals:

```bash
cd contracts
npm run chain
```

```bash
cd contracts
npm run deploy:localhost
```

The FHE Hardhat mock implements encrypted randomness, so no VRF coordinator or fulfillment transaction is needed.

## Sepolia contracts

Cube uses Zama's published Sepolia assets:

| Asset | Address |
| --- | --- |
| `cUSDCMock` ERC-7984 wrapper | `0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639` |
| Mintable test USDC | `0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF` |

Source: [Zama Sepolia address registry](https://github.com/zama-ai/protocol-apps/blob/main/docs/addresses/testnet/sepolia.md).
The frontend's **Mint 1,000 test USDC** button is the judge faucet. It calls the published mock token's `mint` method.

Create the deployer environment file:

```bash
cd contracts
cp .env.example .env
```

Set `DEPLOYER_PRIVATE_KEY`, either `INFURA_API_KEY`, `ALCHEMY_API_KEY`, or `SEPOLIA_RPC_URL`, and optionally
`ETHERSCAN_API_KEY`. Use a dedicated, minimally funded Sepolia key. The key may include or omit `0x`; it is Git-ignored
and must never appear in a frontend or `NEXT_PUBLIC_*` variable. `DRAW_DURATION_SECONDS` defaults to the minimum demo
interval of 300 seconds and accepts up to 2,592,000 seconds.

```bash
npm run deploy:sepolia -- --tags Pool
```

The deployment validates the official token addresses, deploys the strategy, Prize Pool, and vault, and performs their
one-time wiring. No Chainlink subscription or callback is required.

## Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

```dotenv
NEXT_PUBLIC_VAULT_ADDRESS=0x...
NEXT_PUBLIC_YIELD_STRATEGY_ADDRESS=0x...
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://...
```

Create a project ID in [WalletConnect Cloud](https://cloud.walletconnect.com/). RainbowKit handles wallet discovery and
Sepolia switching. The connected wallet transport is reused by ethers and Zama's relayer SDK for encrypted inputs and
EIP-712 user decryption.

Judge flow:

`connect Sepolia → mint → shield → authorize → deposit → fund/harvest yield → close with FHE RNG → settle → decrypt → claim → withdraw`

Keeper flow: after each countdown, call **Close + FHE RNG** once and **Settle draw** repeatedly until the participant
count is processed. All lifecycle methods are permissionless, so this can later be automated with Gelato, OpenZeppelin
Defender, or another transaction scheduler without granting custody or randomness control.

## Privacy and information leakage

Encrypted onchain:

- confidential wallet balance, vault principal, aggregate principal, per-user and aggregate TWAB;
- strategy principal/reserve/accrual and Prize Pool liquidity;
- FHE random values, weighted tickets, settlement cursor, winner flags, tier prizes, and user payouts.

Intentionally public:

- account addresses, participant registry/count, transaction senders/timing/gas, draw schedule/state, and settlement
  progress;
- public test-USDC mint, approval, and wrap amounts before the confidential boundary;
- that an address requests decryption offchain and/or submits a claim transaction. Claim timing can correlate activity,
  although the transferred amount and whether it is zero remain encrypted.

Fairness is publicly auditable from deployed bytecode/source, the `closeDraw()` transaction, FHE operation handles,
events, and Zama protocol execution. Unlike a public VRF, the random word is not disclosed: unpredictability and correct
encrypted execution rely on Zama's protocol and threshold infrastructure. Only each participant receives ACL permission
to decrypt their own zero-or-prize result.

## Error handling

- RainbowKit prompts for Sepolia and exposes account/network state.
- The UI requires vault/strategy ERC-7984 authorization before deposit or reserve funding.
- Public approval and shielding are separate confirmed transactions; insufficient public test USDC is reported.
- Zero/negative inputs are rejected client-side.
- Draw countdown/state errors, duplicate claims, missing participation, relayer failures, and rejected EIP-712
  signatures are surfaced as wallet notifications/toasts.
- Confidential insufficient deposit/withdraw amounts cannot safely revert based on a secret. ERC-7984 masks a failed
  confidential transfer, and over-withdrawal deliberately transfers encrypted zero.

## Tests and production status

The FHE mock suite covers private deposits and ACL denial, bounded encrypted random tickets, TWAB-weighted tier payouts,
yield reservation and explicit claim, continuous next-draw deposits, rollover, no-loss withdrawals, masked
over-withdrawals, and withdrawals while paused.

Before calling the submission production-ready, the repository must also have verified Sepolia contracts, a public
GitHub URL, and a publicly accessible frontend URL. For real-value deployment, replace the mock strategy, bound
lifetime participant/observation growth, automate settlement, transfer ownership to a timelocked multisig, add
monitoring and incident procedures, and obtain independent audits.

See [SECURITY.md](SECURITY.md) for detailed assumptions and limitations.

## References

- [Zama FHE randomness](https://docs.zama.ai/fhevm/smart-contract/random)
- [Zama relayer EIP-712 user decryption](https://docs.zama.ai/protocol/relayer-sdk-guides/fhevm-relayer/decryption/user-decryption)
- [Zama FHEVM documentation](https://docs.zama.ai/fhevm)
- [OpenZeppelin confidential contracts](https://github.com/OpenZeppelin/openzeppelin-confidential-contracts)
- [PoolTogether](https://pooltogether.com/)

## License

BSD-3-Clause-Clear. See [LICENSE](LICENSE).
