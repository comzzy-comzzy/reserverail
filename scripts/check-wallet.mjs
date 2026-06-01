#!/usr/bin/env node
import { loadNetwork, parseArgs, publicClient, walletClient } from "./lib.mjs";

try {
  const args = parseArgs();
  const network = loadNetwork(args.network);
  const { account } = walletClient(network);
  const balance = await publicClient(network).getBalance({ address: account.address });

  console.log(JSON.stringify({
    ok: true,
    network: network.name,
    chainId: network.chainId,
    address: account.address,
    nativeBalanceRaw: balance.toString(),
    nativeToken: network.nativeToken
  }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
