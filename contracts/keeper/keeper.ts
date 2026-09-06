import "dotenv/config";

import { Contract, JsonRpcProvider, Wallet, getAddress, isAddress, type ContractTransactionResponse } from "ethers";

const vaultAbi = [
  "function currentDrawId() view returns (uint64)",
  "function oldestPendingDrawId() view returns (uint64)",
  "function drawInfo(uint64) view returns (uint48 openedAt,uint48 closesAt,uint32 processed,uint8 state)",
  "function openDraw()",
  "function harvestYield()",
  "function closeDraw()",
  "function settleBatch(uint64 drawId,uint32 batchSize)",
] as const;

const OPEN = 1;
const READY = 2;

function requiredAddress(name: string): string {
  const value = process.env[name] ?? "";
  if (!isAddress(value)) throw new Error(`${name} must be a valid contract address`);
  return getAddress(value);
}

function requiredPrivateKey(): string {
  const value = process.env.KEEPER_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY ?? "";
  const key = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("Set KEEPER_PRIVATE_KEY to a 32-byte hexadecimal private key");
  }
  return key;
}

function rpcUrl(): string {
  if (process.env.KEEPER_RPC_URL) return process.env.KEEPER_RPC_URL;
  if (process.env.SEPOLIA_RPC_URL) return process.env.SEPOLIA_RPC_URL;
  if (process.env.ALCHEMY_API_KEY) {
    return `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
  }
  if (process.env.INFURA_API_KEY) return `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`;
  throw new Error("Set KEEPER_RPC_URL, SEPOLIA_RPC_URL, ALCHEMY_API_KEY, or INFURA_API_KEY");
}

function integerSetting(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function enabled(name: string, fallback = false): boolean {
  return (process.env[name] ?? String(fallback)).toLowerCase() === "true";
}

function log(message: string, details?: Record<string, unknown>) {
  const suffix = details ? ` ${JSON.stringify(details)}` : "";
  console.log(`${new Date().toISOString()} ${message}${suffix}`);
}

async function main() {
  const provider = new JsonRpcProvider(rpcUrl());
  const wallet = new Wallet(requiredPrivateKey(), provider);
  const vaultAddress = requiredAddress("VAULT_ADDRESS");
  const vault = new Contract(vaultAddress, vaultAbi, wallet);
  const expectedChainId = BigInt(integerSetting("KEEPER_CHAIN_ID", 11155111, 1, Number.MAX_SAFE_INTEGER));
  const pollInterval = integerSetting("KEEPER_POLL_INTERVAL_MS", 30_000, 5_000, 300_000);
  const batchSize = integerSetting("KEEPER_SETTLEMENT_BATCH_SIZE", 16, 1, 16);
  const maxBatches = integerSetting("KEEPER_MAX_BATCHES_PER_TICK", 4, 1, 100);
  const confirmations = integerSetting("KEEPER_CONFIRMATIONS", 1, 1, 20);
  const harvestBeforeClose = enabled("KEEPER_HARVEST_BEFORE_CLOSE");
  const harvestLead = integerSetting("KEEPER_HARVEST_LEAD_SECONDS", 60, 15, 3600);
  const runOnce = enabled("KEEPER_RUN_ONCE");
  const harvestedDraws = new Set<bigint>();
  let stopping = false;
  let running = false;

  const network = await provider.getNetwork();
  if (network.chainId !== expectedChainId) {
    throw new Error(`Keeper expected chain ${expectedChainId}, but RPC returned ${network.chainId}`);
  }

  async function send(label: string, action: () => Promise<ContractTransactionResponse>) {
    const transaction = await action();
    log(`${label} submitted`, { transactionHash: transaction.hash });
    const receipt = await transaction.wait(confirmations);
    if (!receipt || receipt.status !== 1) throw new Error(`${label} transaction failed`);
    log(`${label} confirmed`, { blockNumber: receipt.blockNumber });
  }

  async function cycle() {
    if (running) return;
    running = true;
    try {
      let drawId = (await vault.currentDrawId()) as bigint;
      if (drawId === 0n) {
        await send("Initial draw open", () => vault.openDraw());
        drawId = (await vault.currentDrawId()) as bigint;
      }

      const draw = await vault.drawInfo(drawId);
      const closesAt = Number(draw[1]);
      const state = Number(draw[3]);
      const latestBlock = await provider.getBlock("latest");
      if (!latestBlock) throw new Error("Could not read the latest block");
      const remaining = closesAt - latestBlock.timestamp;

      if (state === OPEN && harvestBeforeClose && remaining > 0 && remaining <= harvestLead) {
        if (!harvestedDraws.has(drawId)) {
          await send(`Draw ${drawId} yield harvest`, () => vault.harvestYield());
          harvestedDraws.add(drawId);
        }
      }

      if (state === OPEN && remaining <= 0) {
        await send(`Draw ${drawId} FHE close`, () => vault.closeDraw());
        harvestedDraws.delete(drawId);
      } else {
        log("Keeper heartbeat", { drawId: drawId.toString(), secondsUntilClose: Math.max(0, remaining) });
      }

      for (let batch = 0; batch < maxBatches; batch++) {
        const pendingDrawId = (await vault.oldestPendingDrawId()) as bigint;
        if (pendingDrawId === 0n) break;
        const pending = await vault.drawInfo(pendingDrawId);
        if (Number(pending[3]) !== READY) break;
        await send(`Draw ${pendingDrawId} settlement batch`, () => vault.settleBatch(pendingDrawId, batchSize));
      }
    } catch (error) {
      log("Keeper cycle failed", { error: error instanceof Error ? error.message : String(error) });
      if (runOnce) throw error;
    } finally {
      running = false;
    }
  }

  process.once("SIGINT", () => {
    stopping = true;
  });
  process.once("SIGTERM", () => {
    stopping = true;
  });

  log("Keeper started", {
    chainId: network.chainId.toString(),
    keeper: wallet.address,
    vault: vaultAddress,
    pollInterval,
    harvestBeforeClose,
  });

  do {
    await cycle();
    if (!runOnce && !stopping) await new Promise((resolve) => setTimeout(resolve, pollInterval));
  } while (!runOnce && !stopping);

  log("Keeper stopped");
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
