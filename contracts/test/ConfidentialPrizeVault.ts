import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import type {
  ConfidentialPrizeVault,
  ConfidentialPrizePool,
  ConfidentialYieldStrategy,
  LocalConfidentialUSDC,
  LocalMockUSDC,
} from "../types";

const UNIT = 1_000_000n;
const tokens = (value: number) => BigInt(value) * UNIT;

describe("ConfidentialPrizeVault", function () {
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let sponsor: HardhatEthersSigner;
  let underlying: LocalMockUSDC;
  let confidentialAsset: LocalConfidentialUSDC;
  let strategy: ConfidentialYieldStrategy;
  let vault: ConfidentialPrizeVault;
  let prizePool: ConfidentialPrizePool;
  let vaultAddress: string;
  let assetAddress: string;

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    [, alice, bob, sponsor] = await ethers.getSigners();

    underlying = (await (await ethers.getContractFactory("LocalMockUSDC")).deploy()) as LocalMockUSDC;
    confidentialAsset = (await (
      await ethers.getContractFactory("LocalConfidentialUSDC")
    ).deploy(await underlying.getAddress())) as LocalConfidentialUSDC;
    strategy = (await (
      await ethers.getContractFactory("ConfidentialYieldStrategy")
    ).deploy(await confidentialAsset.getAddress())) as ConfidentialYieldStrategy;
    prizePool = (await (
      await ethers.getContractFactory("ConfidentialPrizePool")
    ).deploy(await confidentialAsset.getAddress())) as ConfidentialPrizePool;
    vault = (await (
      await ethers.getContractFactory("ConfidentialPrizeVault")
    ).deploy(
      await confidentialAsset.getAddress(),
      await strategy.getAddress(),
      await prizePool.getAddress(),
      300,
    )) as ConfidentialPrizeVault;

    vaultAddress = await vault.getAddress();
    assetAddress = await confidentialAsset.getAddress();
    await strategy.setVault(vaultAddress);
    await prizePool.setVault(vaultAddress);
  });

  async function shield(user: HardhatEthersSigner, amount: bigint) {
    await underlying.mint(user.address, amount);
    await underlying.connect(user).approve(assetAddress, amount);
    await confidentialAsset.connect(user).wrap(user.address, amount);
  }

  async function authorizeVault(user: HardhatEthersSigner) {
    await confidentialAsset.connect(user).setOperator(vaultAddress, (1n << 48n) - 1n);
  }

  async function encryptedAmount(user: HardhatEthersSigner, amount: bigint) {
    return fhevm.createEncryptedInput(vaultAddress, user.address).add64(amount).encrypt();
  }

  async function encryptedStrategyAmount(user: HardhatEthersSigner, amount: bigint) {
    return fhevm
      .createEncryptedInput(await strategy.getAddress(), user.address)
      .add64(amount)
      .encrypt();
  }

  async function deposit(user: HardhatEthersSigner, amount: bigint) {
    const input = await encryptedAmount(user, amount);
    await vault.connect(user).deposit(input.handles[0], input.inputProof);
  }

  async function contribute(user: HardhatEthersSigner, amount: bigint) {
    const input = await encryptedAmount(user, amount);
    await vault.connect(user).contributePrize(input.handles[0], input.inputProof);
  }

  async function withdraw(user: HardhatEthersSigner, amount: bigint) {
    const input = await encryptedAmount(user, amount);
    await vault.connect(user).withdraw(input.handles[0], input.inputProof);
  }

  async function closeDraw(drawId = 1n) {
    const info = await vault.drawInfo(drawId);
    await time.increaseTo(info[1]);
    await vault.closeDraw();
  }

  async function decrypt64(handle: string, signer: HardhatEthersSigner) {
    return fhevm.userDecryptEuint(FhevmType.euint64, handle, vaultAddress, signer);
  }

  async function decryptAssetBalance(signer: HardhatEthersSigner) {
    const handle = await confidentialAsset.confidentialBalanceOf(signer.address);
    return fhevm.userDecryptEuint(FhevmType.euint64, handle, assetAddress, signer);
  }

  async function debugDecrypt64(handle: string) {
    return fhevm.debugger.decryptEuint(FhevmType.euint64, handle);
  }

  async function debugDecrypt128(handle: string) {
    return fhevm.debugger.decryptEuint(FhevmType.euint128, handle);
  }

  it("keeps deposits private and preserves principal", async function () {
    await vault.connect(alice).openDraw();
    await shield(alice, tokens(500));
    await authorizeVault(alice);
    await deposit(alice, tokens(300));

    expect(await vault.participantCount()).to.equal(1);
    const [principal] = await vault.connect(alice).myPosition();
    expect(await decrypt64(principal, alice)).to.equal(tokens(300));
    await expect(fhevm.userDecryptEuint(FhevmType.euint64, await vault.encryptedTotalPrincipal(), vaultAddress, bob)).to
      .be.rejected;
  });

  it("generates encrypted FHE tickets bounded by encrypted total TWAB", async function () {
    await vault.openDraw();
    await shield(alice, tokens(100));
    await authorizeVault(alice);
    await deposit(alice, tokens(75));
    await closeDraw();

    const [totalTwab] = await vault.encryptedDrawState(1);
    const total = await debugDecrypt128(totalTwab);
    expect(total).to.be.greaterThan(0n);
    for (let tier = 0; tier < 3; tier++) {
      const [ticket] = await vault.encryptedTierState(1, tier);
      expect(await debugDecrypt128(ticket)).to.be.lessThan(total);
    }
    expect((await vault.drawInfo(1))[3]).to.equal(2); // Ready
    expect((await vault.drawInfo(2))[3]).to.equal(1); // Open
  });

  it("lets anyone advance and settle an empty draw", async function () {
    await vault.openDraw();
    const info = await vault.drawInfo(1);
    await time.increaseTo(info[1]);
    await vault.connect(bob).closeDraw();
    await vault.connect(sponsor).settleBatch(1, 16);

    expect((await vault.drawInfo(1))[3]).to.equal(3);
    expect(await vault.currentDrawId()).to.equal(2);
  });

  it("keeps the next draw open without expanding the closed draw participant set", async function () {
    await vault.openDraw();
    await shield(alice, tokens(200));
    await shield(bob, tokens(200));
    await shield(sponsor, tokens(50));
    await authorizeVault(alice);
    await authorizeVault(bob);
    await authorizeVault(sponsor);
    await deposit(alice, tokens(100));
    await contribute(sponsor, tokens(20));
    await closeDraw();

    await deposit(bob, tokens(75));
    await vault.settleBatch(1, 16);
    await expect(vault.connect(bob).claim(1)).to.be.revertedWithCustomError(vault, "NotParticipant");
    expect((await vault.drawInfo(2))[3]).to.equal(1);
  });

  it("harvests encrypted yield, reserves it on settlement, and pays only on claim", async function () {
    await vault.openDraw();
    await shield(alice, tokens(500));
    await shield(sponsor, tokens(100));
    await authorizeVault(alice);
    await confidentialAsset.connect(sponsor).setOperator(await strategy.getAddress(), (1n << 48n) - 1n);
    await deposit(alice, tokens(300));

    const yieldInput = await encryptedStrategyAmount(sponsor, tokens(25));
    await strategy.connect(sponsor).fundYieldReserve(yieldInput.handles[0], yieldInput.inputProof);
    await time.increase(120);
    await vault.harvestYield();
    await closeDraw();
    await vault.settleBatch(1, 16);

    const [, payout] = await vault.connect(alice).myDrawResult(1);
    expect(await decrypt64(payout, alice)).to.be.greaterThan(0n);
    const beforeClaim = await decryptAssetBalance(alice);
    await vault.connect(alice).claim(1);
    expect(await decryptAssetBalance(alice)).to.be.greaterThan(beforeClaim);
    expect(await vault.claimed(1, alice.address)).to.equal(true);
  });

  it("weights every tier by encrypted TWAB and masks non-winning payouts", async function () {
    await vault.openDraw();
    await shield(alice, tokens(500));
    await shield(bob, tokens(500));
    await shield(sponsor, tokens(100));
    await authorizeVault(alice);
    await authorizeVault(bob);
    await authorizeVault(sponsor);
    await deposit(alice, tokens(300));
    await deposit(bob, tokens(100));
    await contribute(sponsor, tokens(40));
    await closeDraw();
    await vault.settleBatch(1, 16);

    const [aliceWon, alicePayout] = await vault.connect(alice).myDrawResult(1);
    const [bobWon, bobPayout] = await vault.connect(bob).myDrawResult(1);
    const alicePrize = await decrypt64(alicePayout, alice);
    const bobPrize = await decrypt64(bobPayout, bob);
    expect(alicePrize + bobPrize).to.equal(tokens(40));
    expect(await fhevm.userDecryptEbool(aliceWon, vaultAddress, alice)).to.equal(alicePrize > 0n);
    expect(await fhevm.userDecryptEbool(bobWon, vaultAddress, bob)).to.equal(bobPrize > 0n);
    expect(await debugDecrypt64(await prizePool.encryptedAvailableLiquidity())).to.equal(0);

    await vault.connect(alice).claim(1);
    await vault.connect(bob).claim(1);
    expect((await decryptAssetBalance(alice)) + (await decryptAssetBalance(bob))).to.equal(tokens(640));
  });

  it("rolls an unawarded empty prize into the next draw", async function () {
    await vault.openDraw();
    await shield(alice, tokens(100));
    await shield(sponsor, tokens(100));
    await authorizeVault(alice);
    await authorizeVault(sponsor);
    await contribute(sponsor, tokens(40));
    await closeDraw();
    await vault.settleBatch(1, 16);

    await deposit(alice, tokens(75));
    await closeDraw(2);
    await vault.settleBatch(2, 16);
    const [, payout] = await vault.connect(alice).myDrawResult(2);
    expect(await decrypt64(payout, alice)).to.equal(tokens(40));
  });

  it("allows withdrawal after close without changing the frozen draw", async function () {
    await vault.openDraw();
    await shield(alice, tokens(500));
    await shield(sponsor, tokens(100));
    await authorizeVault(alice);
    await authorizeVault(sponsor);
    await deposit(alice, tokens(300));
    await contribute(sponsor, tokens(20));
    await closeDraw();
    await withdraw(alice, tokens(125));

    const [principal] = await vault.connect(alice).myPosition();
    expect(await decrypt64(principal, alice)).to.equal(tokens(175));
    await vault.settleBatch(1, 16);
    const [, payout] = await vault.connect(alice).myDrawResult(1);
    expect(await decrypt64(payout, alice)).to.equal(tokens(20));
  });

  it("prevents claiming the same confidential result twice", async function () {
    await vault.openDraw();
    await shield(alice, tokens(100));
    await shield(sponsor, tokens(20));
    await authorizeVault(alice);
    await authorizeVault(sponsor);
    await deposit(alice, tokens(75));
    await contribute(sponsor, tokens(20));
    await closeDraw();
    await vault.settleBatch(1, 16);
    await vault.connect(alice).claim(1);
    await expect(vault.connect(alice).claim(1)).to.be.revertedWithCustomError(vault, "AlreadyClaimed");
  });

  it("turns an over-withdrawal into an encrypted zero transfer", async function () {
    await vault.openDraw();
    await shield(alice, tokens(100));
    await authorizeVault(alice);
    await deposit(alice, tokens(75));
    await withdraw(alice, tokens(76));
    const [principal] = await vault.connect(alice).myPosition();
    expect(await decrypt64(principal, alice)).to.equal(tokens(75));
  });

  it("keeps withdrawals available while deposits are paused", async function () {
    await vault.openDraw();
    await shield(alice, tokens(100));
    await authorizeVault(alice);
    await deposit(alice, tokens(75));
    await vault.pause();

    const blockedInput = await encryptedAmount(alice, tokens(1));
    await expect(vault.connect(alice).deposit(blockedInput.handles[0], blockedInput.inputProof)).to.be.reverted;
    await withdraw(alice, tokens(25));
    const [principal] = await vault.connect(alice).myPosition();
    expect(await decrypt64(principal, alice)).to.equal(tokens(50));
  });
});
