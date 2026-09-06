"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  formatUnits,
  parseUnits,
  type Eip1193Provider,
} from "ethers";
import type { FhevmInstance } from "@zama-fhe/relayer-sdk/web";
import { toast } from "sonner";
import { useAccount, useWalletClient } from "wagmi";
import { sepolia } from "wagmi/chains";
import {
  addresses,
  confidentialAssetAbi,
  isConfigured,
  underlyingAbi,
  vaultAbi,
  yieldStrategyAbi,
} from "@/lib/contracts";
import { decryptForUser, decryptedValue, getFheInstance } from "@/lib/fhe";

export type DrawSnapshot = {
  id: bigint;
  openedAt: number;
  closesAt: number;
  processed: number;
  state: number;
  participants: number;
};

const stateLabels = ["Not started", "Deposits open", "Ready to settle", "Settled"];

function readableTransactionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("0x5f15a8f9") || message.includes("DrawNotOpen")) {
    return "Initialize the first draw before using the confidential vault.";
  }
  if (message.includes("0xe882e99a") || message.includes("DrawStillOpen")) {
    return "The draw countdown has not finished yet.";
  }
  if (message.includes("0x0d65ca83") || message.includes("InvalidDrawState")) {
    return "That action is unavailable in the current draw state. Refresh and advance the lifecycle first.";
  }
  if (message.includes("AlreadyClaimed")) return "You have already claimed this draw result.";
  if (message.includes("NotParticipant")) return "Deposit into the vault before claiming a draw result.";
  if (message.includes("operator") || message.includes("NotOperator")) {
    return "Authorize the confidential asset for this contract first.";
  }
  if (message.includes("ERC20InsufficientBalance") || message.includes("insufficient funds")) {
    return "Your public test-USDC balance is insufficient for this action.";
  }
  return message;
}

export function useCube() {
  const account = useAccount();
  const { data: walletClient } = useWalletClient();
  const [fhe, setFhe] = useState<FhevmInstance | null>(null);
  const address = account.address ?? "";
  const chainId = account.chainId ? BigInt(account.chainId) : null;
  const eip1193Provider = useMemo(
    () => walletClient?.transport as unknown as Eip1193Provider | undefined,
    [walletClient],
  );
  const provider = useMemo(() => {
    if (!eip1193Provider || !walletClient?.chain || walletClient.chain.id !== 11155111) return null;
    return new BrowserProvider(eip1193Provider, {
      chainId: walletClient.chain.id,
      name: walletClient.chain.name,
    });
  }, [eip1193Provider, walletClient]);
  const readProvider = useMemo(
    () =>
      new JsonRpcProvider(
        process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || sepolia.rpcUrls.default.http[0],
        { chainId: sepolia.id, name: sepolia.name },
        { staticNetwork: true },
      ),
    [],
  );
  const [draw, setDraw] = useState<DrawSnapshot | null>(null);
  const [pendingDraw, setPendingDraw] = useState<DrawSnapshot | null>(null);
  const [latestSettledDrawId, setLatestSettledDrawId] = useState(0n);
  const [isOperator, setIsOperator] = useState(false);
  const [publicBalance, setPublicBalance] = useState("—");
  const [privateBalance, setPrivateBalance] = useState("••••••");
  const [principal, setPrincipal] = useState("••••••");
  const [twab, setTwab] = useState("••••••");
  const [won, setWon] = useState<boolean | null>(null);
  const [payout, setPayout] = useState("••••••");
  const [decryptedResultDrawId, setDecryptedResultDrawId] = useState(0n);
  const [decryptedResultOwner, setDecryptedResultOwner] = useState("");
  const [claimed, setClaimed] = useState(false);
  const [busy, setBusy] = useState("");

  const contracts = useMemo(() => {
    if (!provider) return null;
    const runner = provider.getSigner();
    return runner.then((signer) => ({
      signer,
      vault: new Contract(addresses.vault, vaultAbi, signer),
      asset: new Contract(addresses.confidentialAsset, confidentialAssetAbi, signer),
      underlying: new Contract(addresses.underlying, underlyingAbi, signer),
      strategy: new Contract(addresses.yieldStrategy, yieldStrategyAbi, signer),
    }));
  }, [provider]);
  const readContracts = useMemo(
    () => ({
      vault: new Contract(addresses.vault, vaultAbi, readProvider),
      asset: new Contract(addresses.confidentialAsset, confidentialAssetAbi, readProvider),
      underlying: new Contract(addresses.underlying, underlyingAbi, readProvider),
    }),
    [readProvider],
  );

  useEffect(() => {
    if (!eip1193Provider || chainId !== 11155111n) return;
    let cancelled = false;
    void getFheInstance(eip1193Provider)
      .then((instance) => {
        if (!cancelled) setFhe(instance);
      })
      .catch((error: unknown) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Could not connect the Zama relayer");
      });
    return () => {
      cancelled = true;
    };
  }, [chainId, eip1193Provider]);

  const refresh = useCallback(async () => {
    if (!address || !isConfigured) return;
    try {
      const { vault, asset, underlying } = readContracts;
      const [drawId, pendingId, settledId, count, vaultOperator, strategyOperator, clearBalance] = await Promise.all([
        vault.currentDrawId(),
        vault.oldestPendingDrawId(),
        vault.latestSettledDrawId(),
        vault.participantCount(),
        asset.isOperator(address, addresses.vault),
        asset.isOperator(address, addresses.yieldStrategy),
        underlying.balanceOf(address),
      ]);
      setIsOperator(vaultOperator && strategyOperator);
      setLatestSettledDrawId(settledId);
      setClaimed(settledId === 0n ? false : await vault.claimed(settledId, address));
      setPublicBalance(formatUnits(clearBalance, 6));
      if (drawId === 0n) {
        setDraw({
          id: 0n,
          openedAt: 0,
          closesAt: 0,
          processed: 0,
          state: 0,
          participants: Number(count),
        });
      } else {
        const info = await vault.drawInfo(drawId);
        setDraw({
          id: drawId,
          openedAt: Number(info[0]),
          closesAt: Number(info[1]),
          processed: Number(info[2]),
          state: Number(info[3]),
          participants: Number(count),
        });
      }
      if (pendingId === 0n) {
        setPendingDraw(null);
      } else {
        const info = await vault.drawInfo(pendingId);
        setPendingDraw({
          id: pendingId,
          openedAt: Number(info[0]),
          closesAt: Number(info[1]),
          processed: Number(info[2]),
          state: Number(info[3]),
          participants: Number(count),
        });
      }
    } catch (error) {
      console.error(error);
    }
  }, [address, readContracts]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 12_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const transact = useCallback(
    async (label: string, action: () => Promise<{ wait(): Promise<unknown> }>) => {
      try {
        setBusy(label);
        const tx = await action();
        toast.message(`${label} submitted`);
        await tx.wait();
        toast.success(`${label} confirmed`);
        await refresh();
        return true;
      } catch (error) {
        toast.error(readableTransactionError(error));
        return false;
      } finally {
        setBusy("");
      }
    },
    [refresh],
  );

  const encrypt = useCallback(
    async (amount: string, contractAddress = addresses.vault) => {
      if (!fhe || !address) throw new Error("Connect the Zama relayer first");
      const value = parseUnits(amount, 6);
      if (value <= 0n) throw new Error("Enter an amount greater than zero");
      return fhe.createEncryptedInput(contractAddress, address).add64(value).encrypt();
    },
    [address, fhe],
  );

  const mintTestUsdc = useCallback(async () => {
    if (!contracts || !address) return;
    const { underlying } = await contracts;
    await transact("Mint test USDC", () => underlying.mint(address, parseUnits("1000", 6)));
  }, [address, contracts, transact]);

  const shield = useCallback(
    async (amount: string) => {
      if (!contracts || !address) return;
      const { asset, underlying } = await contracts;
      const value = parseUnits(amount, 6);
      if (!(await transact("Approve public USDC", () => underlying.approve(addresses.confidentialAsset, value)))) return;
      await transact("Shield as cUSDCMock", () => asset.wrap(address, value));
    },
    [address, contracts, transact],
  );

  const authorize = useCallback(async () => {
    if (!contracts) return;
    const { asset } = await contracts;
    const until = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60);
    if (!(await transact("Authorize prize vault", () => asset.setOperator(addresses.vault, until)))) return;
    await transact("Authorize yield strategy", () => asset.setOperator(addresses.yieldStrategy, until));
  }, [contracts, transact]);

  const encryptedWrite = useCallback(
    async (label: string, method: "deposit" | "withdraw" | "contributePrize", amount: string) => {
      if (!contracts) return;
      setBusy(`Encrypting ${amount} cUSDCMock`);
      try {
        const encrypted = await encrypt(amount);
        const { vault } = await contracts;
        await transact(label, () => vault[method](encrypted.handles[0], encrypted.inputProof));
      } finally {
        setBusy("");
      }
    },
    [contracts, encrypt, transact],
  );

  const fundYieldReserve = useCallback(
    async (amount: string) => {
      if (!contracts) return;
      setBusy(`Encrypting ${amount} cUSDCMock reserve`);
      try {
        const encrypted = await encrypt(amount, addresses.yieldStrategy);
        const { strategy } = await contracts;
        await transact("Fund encrypted yield reserve", () =>
          strategy.fundYieldReserve(encrypted.handles[0], encrypted.inputProof),
        );
      } finally {
        setBusy("");
      }
    },
    [contracts, encrypt, transact],
  );

  const harvestYield = useCallback(async () => {
    if (!contracts) return;
    const { vault } = await contracts;
    await transact("Harvest accrued yield into prize", () => vault.harvestYield());
  }, [contracts, transact]);

  const decryptPosition = useCallback(async () => {
    if (!contracts || !fhe || !address) return;
    try {
      setBusy("Decrypting your position");
      const { signer } = await contracts;
      const { vault, asset } = readContracts;
      const [position, assetBalance] = await Promise.all([vault.myPosition(), asset.confidentialBalanceOf(address)]);
      const pairs = [
        { handle: position[0], contractAddress: addresses.vault },
        { handle: position[1], contractAddress: addresses.vault },
        { handle: assetBalance, contractAddress: addresses.confidentialAsset },
      ];
      const result = await decryptForUser(fhe, signer, address, pairs);
      setPrincipal(formatUnits(decryptedValue(result, position[0]) as bigint, 6));
      setTwab(formatUnits((decryptedValue(result, position[1]) as bigint) ?? 0n, 6));
      setPrivateBalance(formatUnits(decryptedValue(result, assetBalance) as bigint, 6));
      toast.success("Private position decrypted locally");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Decryption failed");
    } finally {
      setBusy("");
    }
  }, [address, contracts, fhe, readContracts]);

  const decryptResult = useCallback(async () => {
    if (!contracts || !fhe || !address || latestSettledDrawId === 0n) return;
    try {
      setBusy("Decrypting draw result");
      const { signer } = await contracts;
      const { vault } = readContracts;
      const resultHandles = await vault.myDrawResult(latestSettledDrawId);
      const pairs = [
        { handle: resultHandles[0], contractAddress: addresses.vault },
        { handle: resultHandles[1], contractAddress: addresses.vault },
      ];
      const result = await decryptForUser(fhe, signer, address, pairs);
      setWon(Boolean(decryptedValue(result, resultHandles[0])));
      setPayout(formatUnits(decryptedValue(result, resultHandles[1]) as bigint, 6));
      setDecryptedResultDrawId(latestSettledDrawId);
      setDecryptedResultOwner(address);
      toast.success("Draw result decrypted locally");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Result decryption failed");
    } finally {
      setBusy("");
    }
  }, [address, contracts, fhe, latestSettledDrawId, readContracts]);

  const claimPrize = useCallback(async () => {
    if (!contracts || latestSettledDrawId === 0n) return;
    const { vault } = await contracts;
    await transact(`Claim sealed result for draw ${latestSettledDrawId}`, () => vault.claim(latestSettledDrawId));
  }, [contracts, latestSettledDrawId, transact]);

  const keeper = useMemo(() => {
    if (!contracts) return null;
    return {
      openDraw: async () => {
        const { vault } = await contracts;
        await transact("Open next draw", () => vault.openDraw());
      },
      closeDraw: async () => {
        const { vault } = await contracts;
        await transact("Harvest, close, and generate FHE draw", () => vault.closeDraw());
      },
      settle: async () => {
        if (!pendingDraw) return;
        const { vault } = await contracts;
        await transact(`Settle encrypted batch for draw ${pendingDraw.id}`, () =>
          vault.settleBatch(pendingDraw.id, 16),
        );
      },
    };
  }, [contracts, pendingDraw, transact]);

  return {
    configured: isConfigured,
    address,
    chainId,
    draw,
    pendingDraw,
    latestSettledDrawId,
    drawLabel: stateLabels[draw?.state ?? 0],
    isOperator,
    publicBalance,
    privateBalance,
    principal,
    twab,
    won: decryptedResultDrawId === latestSettledDrawId && decryptedResultOwner === address ? won : null,
    payout:
      decryptedResultDrawId === latestSettledDrawId && decryptedResultOwner === address ? payout : "••••••",
    resultDecrypted: decryptedResultDrawId === latestSettledDrawId && decryptedResultOwner === address,
    claimed,
    busy,
    mintTestUsdc,
    shield,
    authorize,
    deposit: (amount: string) => encryptedWrite("Deposit privately", "deposit", amount),
    withdraw: (amount: string) => encryptedWrite("Withdraw principal", "withdraw", amount),
    fundYieldReserve,
    harvestYield,
    decryptPosition,
    decryptResult,
    claimPrize,
    keeper,
  };
}
