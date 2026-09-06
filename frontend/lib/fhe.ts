import type { Eip1193Provider, Signer } from "ethers";
import type { FhevmInstance, HandleContractPair } from "@zama-fhe/relayer-sdk/web";

const instancePromises = new WeakMap<object, Promise<FhevmInstance>>();
const ZERO_HANDLE = `0x${"0".repeat(64)}` as `0x${string}`;

function isZeroHandle(handle: string | Uint8Array) {
  return typeof handle === "string"
    ? handle.toLowerCase() === ZERO_HANDLE
    : handle.every((byte) => byte === 0);
}

export async function getFheInstance(provider: Eip1193Provider) {
  let instancePromise = instancePromises.get(provider as object);
  if (!instancePromise) {
    instancePromise = (async () => {
      const { createInstance, initSDK, SepoliaConfig } = await import("@zama-fhe/relayer-sdk/web");
      await initSDK();
      return createInstance({ ...SepoliaConfig, network: provider });
    })();
    instancePromises.set(provider as object, instancePromise);
  }
  return instancePromise;
}

export async function decryptForUser(
  instance: FhevmInstance,
  signer: Signer,
  userAddress: string,
  pairs: HandleContractPair[],
) {
  // Uninitialized encrypted storage is returned as bytes32(0). It is not a
  // ciphertext and the relayer correctly refuses to decrypt it, so resolve it
  // locally and submit only initialized handles for user decryption.
  const encryptedPairs = pairs.filter((pair) => !isZeroHandle(pair.handle));
  if (encryptedPairs.length === 0) return { [ZERO_HANDLE]: 0n };

  const contracts = [...new Set(encryptedPairs.map((pair) => pair.contractAddress))];
  const keypair = instance.generateKeypair();
  const startTimestamp = Math.floor(Date.now() / 1000);
  const durationDays = 7;
  const eip712 = instance.createEIP712(keypair.publicKey, contracts, startTimestamp, durationDays);
  const decryptTypes = {
    UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification.map((field) => ({
      name: field.name,
      type: field.type,
    })),
  };
  const signature = await signer.signTypedData(eip712.domain, decryptTypes, eip712.message);

  const result = await instance.userDecrypt(
    encryptedPairs,
    keypair.privateKey,
    keypair.publicKey,
    signature,
    contracts,
    userAddress,
    startTimestamp,
    durationDays,
  );
  return { [ZERO_HANDLE]: 0n, ...result };
}

export function decryptedValue(result: Readonly<Record<`0x${string}`, unknown>>, handle: string) {
  const match = Object.entries(result).find(([key]) => key.toLowerCase() === handle.toLowerCase());
  return match?.[1];
}
