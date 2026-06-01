#!/usr/bin/env node
import { loadAssetConfig, parseArgs, reserveProof, waterfallArrays } from "./lib.mjs";

try {
  const args = parseArgs();
  const config = loadAssetConfig(args.config);
  const proof = reserveProof(config);
  const waterfall = waterfallArrays(config);

  console.log(JSON.stringify({
    ok: true,
    assetId: config.assetId,
    name: config.name,
    notional: String(config.notional),
    trancheCount: config.tranches.length,
    reserveSourceCount: config.reserves.length,
    totalReserves: proof.totalReserves.toString(),
    coverageBps: proof.coverageBps,
    proofRoot: proof.proofRoot,
    waterfall
  }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
