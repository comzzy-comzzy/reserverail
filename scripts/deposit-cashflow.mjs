#!/usr/bin/env node
import {
  assetIdBytes32,
  defaultGasSettings,
  displayToken,
  erc20Abi,
  loadNetwork,
  normalizeToken,
  parseArgs,
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
  const assetId = args["asset-id"] || "UNSPECIFIED";
  const assetKey = assetIdBytes32(assetId);

  if (amount <= 0n) {
    throw new Error("--amount must be greater than zero");
  }

  console.log(JSON.stringify({
    network: network.name,
    chainId: network.chainId,
    rail,
    assetId,
    assetKey,
    token: displayToken(token, network),
    amountRaw: amount.toString()
  }, null, 2));

  if (args["dry-run"]) {
    console.log("Dry run only. No transaction was sent.");
    process.exit(0);
  }

  const readClient = publicClient(network);
  const { account, client } = walletClient(network);
  let hash;

  if (token === zeroAddress) {
    hash = await client.sendTransaction({
      account,
      to: rail,
      value: amount,
      ...defaultGasSettings()
    });
  } else {
    hash = await client.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: "transfer",
      args: [rail, amount],
      ...defaultGasSettings()
    });
  }

  const receipt = await waitForReceipt(readClient, hash);
  const recordHash = await client.writeContract({
    address: rail,
    abi: reserveRailAbi,
    functionName: "recordCashflow",
    args: [assetKey, token, amount],
    ...defaultGasSettings()
  });
  const recordReceipt = await waitForReceipt(readClient, recordHash);

  console.log(JSON.stringify({
    ok: receipt.status === "success" && recordReceipt.status === "success",
    network: network.name,
    rail,
    signer: account.address,
    assetId,
    assetKey,
    depositTxHash: hash,
    recordCashflowTxHash: recordHash
  }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
