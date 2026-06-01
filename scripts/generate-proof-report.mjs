#!/usr/bin/env node
import {
  assetIdBytes32,
  loadAssetConfig,
  loadNetwork,
  parseArgs,
  publicClient,
  reserveProof,
  validateAddress,
  writeJson
} from "./lib.mjs";

try {
  const args = parseArgs();
  const network = loadNetwork(args.network);
  const client = publicClient(network);
  const rail = validateAddress(args.rail, "Rail");
  const config = loadAssetConfig(args.config);
  const assetId = args["asset-id"] || config.assetId;
  const out = args.out || "reserverail-proof-report.json";
  const proof = reserveProof(config);

  const fetchTx = async (hash) => {
    if (!hash) {
      return null;
    }
    const [tx, receipt] = await Promise.all([
      client.getTransaction({ hash }),
      client.getTransactionReceipt({ hash })
    ]);
    return {
      hash,
      from: tx.from,
      to: tx.to,
      value: tx.value.toString(),
      status: receipt.status,
      blockNumber: receipt.blockNumber?.toString(),
      gasUsed: receipt.gasUsed?.toString(),
      logCount: receipt.logs.length
    };
  };

  const report = {
    skill: "reserverail",
    reportVersion: "0.1.0",
    generatedAt: new Date().toISOString(),
    network: {
      name: network.name,
      chainId: network.chainId,
      explorerUrl: network.explorerUrl
    },
    rail,
    assetId,
    assetKey: assetIdBytes32(assetId),
    asset: config,
    reserveProof: {
      totalReserves: proof.totalReserves.toString(),
      coverageBps: proof.coverageBps,
      proofRoot: proof.proofRoot,
      sources: proof.reserves
    },
    transactions: {
      deploy: await fetchTx(args["deploy-tx"]),
      issue: await fetchTx(args["issue-tx"]),
      waterfall: await fetchTx(args["waterfall-tx"]),
      reserveSnapshot: await fetchTx(args["reserve-tx"]),
      distribution: await fetchTx(args["distribution-tx"])
    },
    notes: [
      "This report binds an RWA asset config, waterfall policy, reserve source hashes, and optional Pharos transaction receipts.",
      "ReserveRail proves hash commitments and coverage math onchain. It does not verify offchain legal ownership by itself."
    ]
  };

  writeJson(out, report);
  console.log(JSON.stringify({
    ok: true,
    out,
    assetId,
    proofRoot: proof.proofRoot
  }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
