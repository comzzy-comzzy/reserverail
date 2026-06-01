#!/usr/bin/env node
import {
  assetIdBytes32,
  defaultGasSettings,
  loadAssetConfig,
  loadNetwork,
  maturityToUnix,
  parseArgs,
  publicClient,
  reserveRailAbi,
  validateAddress,
  waitForReceipt,
  walletClient,
  waterfallArrays
} from "./lib.mjs";

try {
  const args = parseArgs();
  const network = loadNetwork(args.network);
  const rail = validateAddress(args.rail, "Rail");
  const config = loadAssetConfig(args.config);
  const assetKey = assetIdBytes32(args["asset-id"] || config.assetId);
  const waterfall = waterfallArrays(config);

  console.log(JSON.stringify({
    network: network.name,
    chainId: network.chainId,
    rail,
    assetId: args["asset-id"] || config.assetId,
    assetKey,
    asset: {
      name: config.name,
      assetType: config.assetType,
      jurisdiction: config.jurisdiction,
      currency: config.currency,
      notional: String(config.notional),
      maturityDate: config.maturityDate,
      documentHash: config.documentHash,
      metadataUri: config.metadataUri,
      minCoverageBps: config.minCoverageBps
    },
    waterfall
  }, null, 2));

  if (args["dry-run"]) {
    console.log("Dry run only. No transaction was sent.");
    process.exit(0);
  }

  const readClient = publicClient(network);
  const { account, client } = walletClient(network);
  const owner = await readClient.readContract({
    address: rail,
    abi: reserveRailAbi,
    functionName: "owner"
  });
  if (owner.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`Signer ${account.address} is not rail owner ${owner}`);
  }

  const registerHash = await client.writeContract({
    address: rail,
    abi: reserveRailAbi,
    functionName: "registerAsset",
    args: [
      assetKey,
      {
        name: config.name,
        assetType: config.assetType,
        jurisdiction: config.jurisdiction,
        currency: config.currency,
        notional: BigInt(config.notional),
        maturityDate: BigInt(maturityToUnix(config.maturityDate)),
        documentHash: config.documentHash,
        metadataUri: config.metadataUri,
        minCoverageBps: config.minCoverageBps
      }
    ],
    ...defaultGasSettings()
  });
  const registerReceipt = await waitForReceipt(readClient, registerHash);

  const waterfallHash = await client.writeContract({
    address: rail,
    abi: reserveRailAbi,
    functionName: "configureWaterfall",
    args: [assetKey, waterfall.recipients, waterfall.basisPoints, waterfall.priorities, waterfall.labels],
    ...defaultGasSettings()
  });
  const waterfallReceipt = await waitForReceipt(readClient, waterfallHash);

  console.log(JSON.stringify({
    ok: registerReceipt.status === "success" && waterfallReceipt.status === "success",
    network: network.name,
    rail,
    signer: account.address,
    assetId: config.assetId,
    assetKey,
    registerTxHash: registerHash,
    configureWaterfallTxHash: waterfallHash
  }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
