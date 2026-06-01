---
name: reserverail
description: >
  Use ReserveRail when a user wants an AI agent to issue tokenized real-world
  asset records, configure tranche cashflow waterfalls, verify reserve coverage,
  record proof-of-reserve snapshots, distribute asset cashflows, or generate
  RWA audit reports on Pharos. Supports Pharos mainnet and Pharos Atlantic
  testnet.
requires:
  anyBins:
    - node
    - npm
    - npx
---

# ReserveRail

ReserveRail is a Pharos Agent Center skill for autonomous RWA issuance,
cashflow waterfalls, and proof-of-reserve attestations. It gives an AI agent a
structured workflow for registering an asset, configuring tranche recipients,
checking reserve coverage, recording reserve commitments onchain, routing
cashflows, and exporting reviewable proof reports.

## Safety Defaults

- Supported networks are Pharos mainnet and Pharos Atlantic testnet.
- Ask or infer the target network before writes when the prompt is ambiguous.
- Treat `mainnet` as real fund movement. Use `atlantic-testnet` for demos and
  campaign review.
- Never print private keys or ask the user to paste a private key into chat.
- Write operations require `PRIVATE_KEY` in the shell environment.
- Show the network, signer, rail address, asset ID, tranche recipients, payout
  plan, reserve proof root, and coverage before executing a write.
- Use `--dry-run` first for `issue-asset`, `snapshot-reserves`, and
  `distribute-cashflow`.
- Reject malformed asset configs, zero addresses, duplicate tranche recipients,
  tranche shares that do not total exactly 10000 bps, and reserve coverage below
  the asset minimum.
- ReserveRail commits hashes and coverage math onchain. It does not replace
  legal review, custodian verification, or securities compliance.

## Network

Read `assets/networks.json`. Pass `--network mainnet` or
`--network atlantic-testnet` explicitly in generated commands.

## Common Workflows

### Validate An RWA Config

```bash
node scripts/validate-asset.mjs --config assets/example-asset.json
```

### Deploy ReserveRail

```bash
PRIVATE_KEY=... node scripts/deploy-rail.mjs --network mainnet
```

For testnet:

```bash
PRIVATE_KEY=... node scripts/deploy-rail.mjs --network atlantic-testnet
```

### Register Asset And Configure Waterfall

Run a dry run first.

```bash
node scripts/issue-asset.mjs \
  --network atlantic-testnet \
  --rail 0xReserveRail \
  --config assets/example-asset.json \
  --dry-run
```

Then execute with `PRIVATE_KEY` after confirmation.

```bash
PRIVATE_KEY=... node scripts/issue-asset.mjs \
  --network atlantic-testnet \
  --rail 0xReserveRail \
  --config assets/example-asset.json
```

### Record Proof Of Reserve

```bash
node scripts/snapshot-reserves.mjs \
  --network atlantic-testnet \
  --rail 0xReserveRail \
  --config assets/example-asset.json \
  --dry-run
```

Execute:

```bash
PRIVATE_KEY=... node scripts/snapshot-reserves.mjs \
  --network atlantic-testnet \
  --rail 0xReserveRail \
  --config assets/example-asset.json
```

### Distribute Asset Cashflow

Deposit native PHRS/PROS cashflow into the rail before distributing it.

```bash
PRIVATE_KEY=... node scripts/deposit-cashflow.mjs \
  --network atlantic-testnet \
  --rail 0xReserveRail \
  --asset-id DEMO-INVOICE-001 \
  --token native \
  --amount 1000000
```

```bash
node scripts/distribute-cashflow.mjs \
  --network atlantic-testnet \
  --rail 0xReserveRail \
  --asset-id DEMO-INVOICE-001 \
  --token native \
  --amount 1000000 \
  --config assets/example-asset.json \
  --dry-run
```

Execute only after confirming the payout plan.

```bash
PRIVATE_KEY=... node scripts/distribute-cashflow.mjs \
  --network atlantic-testnet \
  --rail 0xReserveRail \
  --asset-id DEMO-INVOICE-001 \
  --token native \
  --amount 1000000 \
  --config assets/example-asset.json
```

### Generate Proof Report

```bash
node scripts/generate-proof-report.mjs \
  --network atlantic-testnet \
  --rail 0xReserveRail \
  --config assets/example-asset.json \
  --issue-tx 0xIssueTx \
  --waterfall-tx 0xWaterfallTx \
  --reserve-tx 0xReserveSnapshotTx \
  --distribution-tx 0xDistributionTx \
  --out reserverail-proof-report.json
```

## Natural Language Examples

- "Validate this RWA invoice pool config before issuing it."
- "Deploy ReserveRail on Pharos Atlantic testnet."
- "Issue this asset and configure a 70/5/20/5 tranche waterfall."
- "Record a proof-of-reserve snapshot if coverage is above 105%."
- "Preview the cashflow waterfall for 1,000 USDC."
- "Distribute this asset cashflow and generate a proof report."

## Resources

- Contract: `contracts/ReserveRail.sol`
- Network config: `assets/networks.json`
- Example asset config: `assets/example-asset.json`
- Safety notes: `references/safety.md`
- Proof report schema: `references/proof-report-schema.md`
