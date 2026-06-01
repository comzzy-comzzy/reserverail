#!/usr/bin/env node
import {
  assetIdBytes32,
  defaultGasSettings,
  loadAssetConfig,
  loadNetwork,
  parseArgs,
  publicClient,
  reserveProof,
  reserveRailAbi,
  validateAddress,
  waitForReceipt,
  walletClient
} from "./lib.mjs";

try {
  const args = parseArgs();
  const network = loadNetwork(args.network);
  const rail = validateAddress(args.rail, "Rail");
  const config = loadAssetConfig(args.config);
  const assetId = args["asset-id"] || config.assetId;
  const assetKey = assetIdBytes32(assetId);
  const proof = reserveProof(config);
  const sourceUri = args["source-uri"] || config.metadataUri;

  console.log(JSON.stringify({
    network: network.name,
    chainId: network.chainId,
    rail,
    assetId,
    assetKey,
    totalReserves: proof.totalReserves.toString(),
    notional: String(config.notional),
    coverageBps: proof.coverageBps,
    minCoverageBps: config.minCoverageBps,
    proofRoot: proof.proofRoot,
    sourceUri,
    reserveSources: proof.reserves
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

  const hash = await client.writeContract({
    address: rail,
    abi: reserveRailAbi,
    functionName: "recordReserveSnapshot",
    args: [assetKey, proof.totalReserves, proof.proofRoot, sourceUri],
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
