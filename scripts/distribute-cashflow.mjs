#!/usr/bin/env node
import {
  assetIdBytes32,
  defaultGasSettings,
  distributionIdFromInputs,
  loadAssetConfig,
  loadNetwork,
  normalizeToken,
  parseArgs,
  printWaterfallPlan,
  publicClient,
  reserveRailAbi,
  validateAddress,
  waitForReceipt,
  walletClient,
  zeroAddress
} from "./lib.mjs";

try {
  const args = parseArgs();
  const network = loadNetwork(args.network);
  const rail = validateAddress(args.rail, "Rail");
  const token = normalizeToken(args.token || "native");
  const amount = BigInt(args.amount);
  const config = loadAssetConfig(args.config);
  const assetId = args["asset-id"] || config.assetId;
  const assetKey = assetIdBytes32(assetId);
  const distributionId = args["distribution-id"] || distributionIdFromInputs({
    network,
    rail,
    assetId,
    token,
    amount,
    config
  });

  printWaterfallPlan({ network, rail, assetId, token, amount, config, distributionId });

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

  const hash = await client.writeContract({
    address: rail,
    abi: reserveRailAbi,
    functionName: "distributeCashflow",
    args: [assetKey, token === zeroAddress ? zeroAddress : token, amount, distributionId],
    ...defaultGasSettings()
  });
  const receipt = await waitForReceipt(readClient, hash);
  console.log(JSON.stringify({
    ok: receipt.status === "success",
    network: network.name,
    rail,
    signer: account.address,
    assetId,
    assetKey,
    txHash: hash,
    blockNumber: receipt.blockNumber?.toString()
  }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
