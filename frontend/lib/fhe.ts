import type { Eip1193Provider, Signer } from "ethers";
import type { FhevmInstance, HandleContractPair } from "@zama-fhe/relayer-sdk/web";

const instancePromises = new WeakMap<object, Promise<FhevmInstance>>();

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
  const contracts = [...new Set(pairs.map((pair) => pair.contractAddress))];
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

  return instance.userDecrypt(
    pairs,
    keypair.privateKey,
    keypair.publicKey,
    signature,
    contracts,
    userAddress,
    startTimestamp,
    durationDays,
  );
}

export function decryptedValue(result: Readonly<Record<`0x${string}`, unknown>>, handle: string) {
  const match = Object.entries(result).find(([key]) => key.toLowerCase() === handle.toLowerCase());
  return match?.[1];
}
