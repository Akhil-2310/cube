import { getAddress, isAddress, ZeroAddress } from "ethers";

const envAddress = (value?: string) => (value && isAddress(value) ? getAddress(value) : ZeroAddress);

export const sepoliaTokens = {
  confidentialUsdcMock: getAddress("0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639"),
  usdcMock: getAddress("0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF"),
} as const;

export const addresses = {
  vault: envAddress(process.env.NEXT_PUBLIC_VAULT_ADDRESS),
  confidentialAsset: sepoliaTokens.confidentialUsdcMock,
  underlying: sepoliaTokens.usdcMock,
  yieldStrategy: envAddress(process.env.NEXT_PUBLIC_YIELD_STRATEGY_ADDRESS),
};

export const isConfigured = addresses.vault !== ZeroAddress && addresses.yieldStrategy !== ZeroAddress;

export const vaultAbi = [
  "error DrawNotOpen()",
  "error DrawStillOpen()",
  "error InvalidDrawState()",
  "error InvalidBatchSize()",
  "error AlreadyClaimed()",
  "error NotParticipant()",
  "function currentDrawId() view returns (uint64)",
  "function oldestPendingDrawId() view returns (uint64)",
  "function latestSettledDrawId() view returns (uint64)",
  "function participantCount() view returns (uint256)",
  "function drawInfo(uint64) view returns (uint48 openedAt,uint48 closesAt,uint32 processed,uint8 state)",
  "function myPosition() view returns (bytes32 principal,bytes32 accruedTwab)",
  "function myDrawResult(uint64) view returns (bytes32 won,bytes32 payout)",
  "function claimed(uint64 drawId,address account) view returns (bool)",
  "function openDraw()",
  "function deposit(bytes32 encryptedAmount,bytes inputProof)",
  "function withdraw(bytes32 encryptedAmount,bytes inputProof)",
  "function contributePrize(bytes32 encryptedAmount,bytes inputProof)",
  "function harvestYield()",
  "function closeDraw()",
  "function settleBatch(uint64 drawId,uint32 batchSize)",
  "function claim(uint64 drawId) returns (bytes32)",
  "function paused() view returns (bool)",
] as const;

export const confidentialAssetAbi = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function confidentialBalanceOf(address) view returns (bytes32)",
  "function isOperator(address holder,address spender) view returns (bool)",
  "function setOperator(address operator,uint48 until)",
  "function wrap(address to,uint256 amount) returns (bytes32)",
] as const;

export const underlyingAbi = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
  "function mint(address to,uint256 amount)",
] as const;

export const yieldStrategyAbi = [
  "function fundYieldReserve(bytes32 encryptedAmount,bytes inputProof) returns (bytes32)",
] as const;
