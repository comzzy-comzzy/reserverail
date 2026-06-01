import fs from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  getAddress,
  http,
  isAddress,
  keccak256,
  parseAbi,
  parseGwei,
  stringToHex,
  toBytes,
  zeroAddress
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const nativeTokenAliases = new Set(["native", "phrs", "pros", zeroAddress]);
export { zeroAddress };

export const reserveRailAbi = parseAbi([
  "constructor(address initialOwner)",
  "function owner() view returns (address)",
  "function registerAsset(bytes32 assetId,(string name,string assetType,string jurisdiction,string currency,uint256 notional,uint64 maturityDate,bytes32 documentHash,string metadataUri,uint16 minCoverageBps) spec)",
  "function configureWaterfall(bytes32 assetId,address[] recipients,uint16[] basisPoints,uint8[] priorities,string[] labels)",
  "function recordCashflow(bytes32 assetId,address token,uint256 amount)",
  "function distributeCashflow(bytes32 assetId,address token,uint256 amount,bytes32 distributionId)",
  "function recordReserveSnapshot(bytes32 assetId,uint256 totalReserves,bytes32 proofRoot,string sourceUri)",
  "function assets(bytes32 assetId) view returns (string name,string assetType,string jurisdiction,string currency,uint256 notional,uint64 maturityDate,bytes32 documentHash,string metadataUri,uint16 minCoverageBps,bool active)",
  "function getWaterfall(bytes32 assetId) view returns ((address recipient,uint16 basisPoints,uint8 priority,string label)[])",
  "function currentWaterfallHash(bytes32 assetId) view returns (bytes32)",
  "function latestReserveSnapshot(bytes32 assetId) view returns (uint256 totalReserves,uint16 coverageBps,bytes32 proofRoot,uint64 timestamp,string sourceUri,address attestor)",
  "event AssetRegistered(bytes32 indexed assetId,string name,string assetType,uint256 notional,bytes32 indexed documentHash)",
  "event WaterfallConfigured(bytes32 indexed assetId,bytes32 indexed waterfallHash,uint256 trancheCount)",
  "event CashflowDistributed(bytes32 indexed assetId,bytes32 indexed distributionId,address indexed token,uint256 grossAmount,uint256 remainder,bytes32 waterfallHash)",
  "event ReserveSnapshotRecorded(bytes32 indexed assetId,bytes32 indexed proofRoot,uint256 totalReserves,uint16 coverageBps,address indexed attestor,string sourceUri)"
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to,uint256 value) returns (bool)"
]);

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (!item.startsWith("--")) {
      throw new Error(`Unexpected argument: ${item}`);
    }
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, bigintReplacer, 2)}\n`);
}

export function loadNetwork(name) {
  const configPath = new URL("../assets/networks.json", import.meta.url);
  const config = readJson(configPath);
  const networkName = name || config.defaultNetwork;
  const network = config.networks.find((entry) => entry.name === networkName);
  if (!network) {
    throw new Error(`Unsupported network: ${networkName}`);
  }
  return network;
}

export function chainFromNetwork(network) {
  return defineChain({
    id: network.chainId,
    name: network.name,
    nativeCurrency: {
      name: network.nativeToken,
      symbol: network.nativeToken,
      decimals: 18
    },
    rpcUrls: {
      default: { http: [network.rpcUrl] }
    },
    blockExplorers: {
      default: {
        name: "PharosScan",
        url: network.explorerUrl
      }
    },
    testnet: network.name !== "mainnet"
  });
}

export function publicClient(network) {
  return createPublicClient({
    chain: chainFromNetwork(network),
    transport: http(network.rpcUrl)
  });
}

export function walletClient(network) {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY is required for write operations. Set it in the shell environment.");
  }
  const account = privateKeyToAccount(normalizePrivateKey(privateKey));
  return {
    account,
    client: createWalletClient({
      account,
      chain: chainFromNetwork(network),
      transport: http(network.rpcUrl)
    })
  };
}

export function normalizePrivateKey(privateKey) {
  const trimmed = String(privateKey || "").trim();
  const normalized = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("PRIVATE_KEY must be a 32-byte hex private key, optionally prefixed with 0x.");
  }
  return normalized;
}

export function validateAddress(value, label) {
  if (!isAddress(value)) {
    throw new Error(`${label} is not a valid EVM address: ${value}`);
  }
  return getAddress(value);
}

export function normalizeToken(token) {
  const value = String(token || "native").toLowerCase();
  if (nativeTokenAliases.has(value)) {
    return zeroAddress;
  }
  return getAddress(token);
}

export function displayToken(token, network) {
  return token === zeroAddress ? network.nativeToken : token;
}

export function loadAssetConfig(configPath) {
  if (!configPath) {
    throw new Error("--config is required");
  }
  const resolved = path.resolve(configPath);
  const config = readJson(resolved);
  validateAssetConfig(config);
  return config;
}

export function validateBytes32(value, label) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(value || ""))) {
    throw new Error(`${label} must be a bytes32 hex string`);
  }
  return value;
}

export function assetIdBytes32(assetId) {
  const value = String(assetId || "").trim();
  if (!value) {
    throw new Error("--asset-id is required");
  }
  if (/^0x[0-9a-fA-F]{64}$/.test(value)) {
    return value;
  }
  if (Buffer.byteLength(value, "utf8") > 31) {
    return keccak256(toBytes(value));
  }
  return stringToHex(value, { size: 32 });
}

export function maturityToUnix(value) {
  if (Number.isInteger(value)) {
    return value;
  }
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(timestamp)) {
    throw new Error(`Invalid maturityDate: ${value}`);
  }
  return Math.floor(timestamp / 1000);
}

export function validateAssetConfig(config) {
  if (!config || typeof config !== "object") {
    throw new Error("Asset config must be a JSON object");
  }
  for (const key of ["assetId", "name", "assetType", "jurisdiction", "currency", "notional", "maturityDate", "documentHash", "metadataUri"]) {
    if (!config[key]) {
      throw new Error(`Asset config missing ${key}`);
    }
  }
  validateBytes32(config.documentHash, "documentHash");
  if (!Number.isInteger(config.minCoverageBps) || config.minCoverageBps < 10000) {
    throw new Error("minCoverageBps must be an integer >= 10000");
  }
  if (BigInt(config.notional) <= 0n) {
    throw new Error("notional must be greater than zero");
  }
  maturityToUnix(config.maturityDate);
  validateWaterfall(config.tranches);
  validateReserves(config.reserves, config);
  return true;
}

export function validateWaterfall(tranches) {
  if (!Array.isArray(tranches) || tranches.length === 0) {
    throw new Error("tranches must be a non-empty array");
  }
  let total = 0;
  const seen = new Set();
  for (const tranche of tranches) {
    if (!tranche.label || typeof tranche.label !== "string") {
      throw new Error("Every tranche needs a label");
    }
    const address = validateAddress(tranche.address, `Tranche ${tranche.label}`);
    const lower = address.toLowerCase();
    if (seen.has(lower)) {
      throw new Error(`Duplicate tranche address: ${address}`);
    }
    seen.add(lower);
    if (!Number.isInteger(tranche.basisPoints) || tranche.basisPoints <= 0) {
      throw new Error(`Tranche ${tranche.label} must have positive integer basisPoints`);
    }
    if (!Number.isInteger(tranche.priority) || tranche.priority < 0 || tranche.priority > 255) {
      throw new Error(`Tranche ${tranche.label} must have priority 0-255`);
    }
    total += tranche.basisPoints;
  }
  if (total !== 10000) {
    throw new Error(`Tranche basis points must total 10000, received ${total}`);
  }
  return true;
}

export function validateReserves(reserves, config) {
  if (!Array.isArray(reserves) || reserves.length === 0) {
    throw new Error("reserves must be a non-empty array");
  }
  let total = 0n;
  for (const reserve of reserves) {
    if (!reserve.source) {
      throw new Error("Every reserve source needs a source label");
    }
    validateBytes32(reserve.proofHash, `Reserve ${reserve.source} proofHash`);
    const amount = BigInt(reserve.amount);
    if (amount <= 0n) {
      throw new Error(`Reserve ${reserve.source} amount must be positive`);
    }
    total += amount;
  }
  const coverage = Number((total * 10000n) / BigInt(config.notional));
  if (coverage < config.minCoverageBps) {
    throw new Error(`Reserve coverage ${coverage} bps is below minimum ${config.minCoverageBps} bps`);
  }
  return true;
}

export function waterfallArrays(config) {
  const sorted = [...config.tranches].sort((a, b) => a.priority - b.priority);
  return {
    recipients: sorted.map((tranche) => getAddress(tranche.address)),
    basisPoints: sorted.map((tranche) => tranche.basisPoints),
    priorities: sorted.map((tranche) => tranche.priority),
    labels: sorted.map((tranche) => tranche.label)
  };
}

export function planWaterfall(amount, config) {
  const gross = BigInt(amount);
  if (gross <= 0n) {
    throw new Error("Amount must be greater than zero");
  }
  let paid = 0n;
  const sorted = [...config.tranches].sort((a, b) => a.priority - b.priority);
  const payouts = sorted.map((tranche) => {
    const payout = (gross * BigInt(tranche.basisPoints)) / 10000n;
    paid += payout;
    return {
      label: tranche.label,
      address: getAddress(tranche.address),
      basisPoints: tranche.basisPoints,
      priority: tranche.priority,
      amount: payout
    };
  });
  return {
    gross,
    payouts,
    remainder: gross - paid
  };
}

export function reserveProof(config) {
  const reserves = config.reserves.map((reserve) => ({
    source: reserve.source,
    amount: String(reserve.amount),
    proofHash: reserve.proofHash
  }));
  const totalReserves = reserves.reduce((sum, reserve) => sum + BigInt(reserve.amount), 0n);
  const coverageBps = Number((totalReserves * 10000n) / BigInt(config.notional));
  const proofRoot = keccak256(toBytes(JSON.stringify({
    assetId: config.assetId,
    notional: String(config.notional),
    reserves
  })));
  return {
    totalReserves,
    coverageBps,
    proofRoot,
    reserves
  };
}

export function distributionIdFromInputs({ network, rail, assetId, token, amount, config }) {
  return keccak256(toBytes(JSON.stringify({
    network: network.name,
    chainId: network.chainId,
    rail: getAddress(rail),
    assetId,
    token,
    amount: String(amount),
    tranches: waterfallArrays(config)
  })));
}

export function printWaterfallPlan({ network, rail, assetId, token, amount, config, distributionId }) {
  const plan = planWaterfall(amount, config);
  console.log(JSON.stringify({
    network: network.name,
    chainId: network.chainId,
    rail: getAddress(rail),
    assetId,
    assetKey: assetIdBytes32(assetId),
    token: displayToken(token, network),
    distributionId,
    grossAmountRaw: plan.gross.toString(),
    payouts: plan.payouts.map((payout) => ({
      ...payout,
      amountRaw: payout.amount.toString()
    })),
    remainderRaw: plan.remainder.toString()
  }, bigintReplacer, 2));
  return plan;
}

export async function waitForReceipt(client, hash) {
  return client.waitForTransactionReceipt({ hash });
}

export function requireFile(filePath, help) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${filePath} not found. ${help || ""}`.trim());
  }
}

export function reserveRailBytecodePath() {
  return path.resolve("build", "contracts_ReserveRail_sol_ReserveRail.bin");
}

export function deploymentBytecode() {
  const filePath = reserveRailBytecodePath();
  requireFile(filePath, "Run npm run compile first.");
  return `0x${fs.readFileSync(filePath, "utf8").trim()}`;
}

export function encodedCall(functionName, args) {
  return encodeFunctionData({
    abi: reserveRailAbi,
    functionName,
    args
  });
}

export function defaultGasSettings() {
  const maxFeeGwei = process.env.MAX_FEE_GWEI || "1";
  const priorityFeeGwei = process.env.MAX_PRIORITY_FEE_GWEI || "0";
  return {
    maxFeePerGas: parseGwei(maxFeeGwei),
    maxPriorityFeePerGas: parseGwei(priorityFeeGwei)
  };
}

export function bigintReplacer(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}
