import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const SEPOLIA_CUSDC_MOCK = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639";
const SEPOLIA_USDC_MOCK = "0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF";
const STRATEGY_DEPLOYMENT = "ConfidentialYieldStrategyV6";
const PRIZE_POOL_DEPLOYMENT = "ConfidentialPrizePoolV6";
const VAULT_DEPLOYMENT = "ConfidentialPrizeVaultV6";

const deployPool: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, execute, read } = hre.deployments;
  const chainId = await hre.getChainId();

  const isSepolia = chainId === "11155111";
  if (isSepolia && (!deployer || deployer === hre.ethers.ZeroAddress)) {
    throw new Error("Set DEPLOYER_PRIVATE_KEY in contracts/.env before deploying.");
  }

  const configuredDrawDuration = process.env.DRAW_DURATION_SECONDS ?? (isSepolia ? "300" : "3600");
  const drawDuration = Number(configuredDrawDuration);
  if (!Number.isSafeInteger(drawDuration) || drawDuration < 300 || drawDuration > 30 * 24 * 60 * 60) {
    throw new Error("DRAW_DURATION_SECONDS must be an integer between 300 and 2592000 seconds.");
  }

  let underlyingAddress: string;
  let confidentialAssetAddress: string;

  if (isSepolia) {
    underlyingAddress = SEPOLIA_USDC_MOCK;
    confidentialAssetAddress = SEPOLIA_CUSDC_MOCK;
    const [underlyingCode, confidentialAssetCode] = await Promise.all([
      hre.ethers.provider.getCode(underlyingAddress),
      hre.ethers.provider.getCode(confidentialAssetAddress),
    ]);
    if (underlyingCode === "0x" || confidentialAssetCode === "0x") {
      throw new Error("The configured Zama Sepolia cUSDCMock deployment is unavailable.");
    }
  } else {
    const underlying = await deploy("LocalMockUSDC", {
      from: deployer,
      log: true,
    });
    const confidentialAsset = await deploy("LocalConfidentialUSDC", {
      from: deployer,
      args: [underlying.address],
      log: true,
    });
    underlyingAddress = underlying.address;
    confidentialAssetAddress = confidentialAsset.address;
  }

  const yieldStrategy = await deploy(STRATEGY_DEPLOYMENT, {
    contract: "ConfidentialYieldStrategy",
    from: deployer,
    args: [confidentialAssetAddress],
    log: true,
  });

  const prizePool = await deploy(PRIZE_POOL_DEPLOYMENT, {
    contract: "ConfidentialPrizePool",
    from: deployer,
    args: [confidentialAssetAddress],
    log: true,
  });

  const vault = await deploy(VAULT_DEPLOYMENT, {
    contract: "ConfidentialPrizeVault",
    from: deployer,
    args: [confidentialAssetAddress, yieldStrategy.address, prizePool.address, drawDuration],
    log: true,
  });

  const configuredVault = await read(STRATEGY_DEPLOYMENT, "vault");
  if (configuredVault === hre.ethers.ZeroAddress) {
    await execute(STRATEGY_DEPLOYMENT, { from: deployer, log: true }, "setVault", vault.address);
  }

  const configuredPrizeVault = await read(PRIZE_POOL_DEPLOYMENT, "vault");
  if (configuredPrizeVault === hre.ethers.ZeroAddress) {
    await execute(PRIZE_POOL_DEPLOYMENT, { from: deployer, log: true }, "setVault", vault.address);
  }

  console.log("Pool deployment:", {
    underlying: underlyingAddress,
    confidentialAsset: confidentialAssetAddress,
    officialZamaWrapper: isSepolia,
    randomness: "Zama FHE.randEuint32 (encrypted onchain CSPRNG)",
    yieldStrategy: yieldStrategy.address,
    prizePool: prizePool.address,
    vault: vault.address,
    drawDurationSeconds: drawDuration,
  });
};

export default deployPool;
deployPool.id = "deploy_confidential_prize_pool_v6";
deployPool.tags = ["Pool"];
