# ReserveRail

ReserveRail is a Pharos Agent Center skill for autonomous RWA issuance,
cashflow waterfall routing, and proof-of-reserve reporting.

It lets an AI agent:

- Register a tokenized real-world asset record with document hash and metadata.
- Configure tranche recipients and priority-aware waterfall policy.
- Validate reserve sources and coverage before writing onchain.
- Commit proof-of-reserve snapshots to Pharos.
- Route native or ERC-20 cashflows through the configured waterfall.
- Export a reviewable proof report for hackathon judges, issuers, or treasury
  operators.

ReserveRail supports both Pharos mainnet and Pharos Atlantic testnet.

## Repository Structure

```text
reserverail/
  SKILL.md                         # Agent Center skill instructions
  README.md                        # Human usage guide
  agents/openai.yaml               # Skill metadata
  contracts/ReserveRail.sol        # RWA issuance, waterfall, reserve contract
  scripts/
    deploy-rail.mjs                # Deploy ReserveRail
    issue-asset.mjs                # Register asset and configure waterfall
    deposit-cashflow.mjs           # Send native/ERC-20 cashflow into a rail
    snapshot-reserves.mjs          # Compute and record reserve proof root
    distribute-cashflow.mjs        # Dry-run or execute waterfall payouts
    generate-proof-report.mjs      # Export proof report JSON
    validate-asset.mjs             # Validate asset config locally
    check-wallet.mjs               # Check signer address and balance
  assets/
    networks.json                  # Pharos mainnet and testnet config
    example-asset.json             # Example RWA asset config
  references/
    safety.md
    proof-report-schema.md
```

## Requirements

- Node.js 18+
- npm
- A funded Pharos wallet on the target network for write operations
- `PRIVATE_KEY` set in the shell for deploy/issue/snapshot/distribution writes

Do not paste private keys into chat, screenshots, GitHub, or config files.

## Install

```bash
git clone https://github.com/comzzy-comzzy/reserverail.git
cd reserverail
npm install
npm run compile
```

## Networks

| Network | Flag | Chain ID | Native token | Use for |
| --- | --- | ---: | --- | --- |
| Pharos mainnet | `--network mainnet` | `1672` | `PROS` | real deployments and asset cashflows |
| Pharos Atlantic testnet | `--network atlantic-testnet` | `688689` | `PHRS` | demos, tests, and campaign reviews |

Pass the network explicitly in every command.

## Quick Demo Without Sending Transactions

```bash
npm install
npm run compile
npm run check
```

Or run each dry-run flow:

```bash
node scripts/validate-asset.mjs --config assets/example-asset.json

node scripts/issue-asset.mjs \
  --network atlantic-testnet \
  --rail 0x5555555555555555555555555555555555555555 \
  --config assets/example-asset.json \
  --dry-run

node scripts/snapshot-reserves.mjs \
  --network atlantic-testnet \
  --rail 0x5555555555555555555555555555555555555555 \
  --config assets/example-asset.json \
  --dry-run

node scripts/distribute-cashflow.mjs \
  --network atlantic-testnet \
  --rail 0x5555555555555555555555555555555555555555 \
  --asset-id DEMO-INVOICE-001 \
  --token native \
  --amount 1000000 \
  --config assets/example-asset.json \
  --dry-run
```

## Full Testnet Flow

Compile the contract and set your wallet key in the shell:

```bash
npm run compile
export PRIVATE_KEY=0x1234...64_hex_characters_total
npm run check:wallet:testnet
```

Deploy ReserveRail:

```bash
node scripts/deploy-rail.mjs --network atlantic-testnet
```

Use the returned `contractAddress` as `0xReserveRail` below.

Register the RWA and configure its tranche waterfall:

```bash
node scripts/issue-asset.mjs \
  --network atlantic-testnet \
  --rail 0xReserveRail \
  --config assets/example-asset.json
```

Record the proof-of-reserve snapshot:

```bash
node scripts/snapshot-reserves.mjs \
  --network atlantic-testnet \
  --rail 0xReserveRail \
  --config assets/example-asset.json
```

After the rail receives cashflow, preview and execute distribution:

```bash
node scripts/deposit-cashflow.mjs \
  --network atlantic-testnet \
  --rail 0xReserveRail \
  --asset-id DEMO-INVOICE-001 \
  --token native \
  --amount 1000000

node scripts/distribute-cashflow.mjs \
  --network atlantic-testnet \
  --rail 0xReserveRail \
  --asset-id DEMO-INVOICE-001 \
  --token native \
  --amount 1000000 \
  --config assets/example-asset.json \
  --dry-run

node scripts/distribute-cashflow.mjs \
  --network atlantic-testnet \
  --rail 0xReserveRail \
  --asset-id DEMO-INVOICE-001 \
  --token native \
  --amount 1000000 \
  --config assets/example-asset.json
```

Generate a proof report:

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

## Mainnet Flow

Use the same commands with `--network mainnet`. Mainnet writes move real funds
and create real asset records, so run dry runs first:

```bash
node scripts/issue-asset.mjs \
  --network mainnet \
  --rail 0xReserveRail \
  --config assets/example-asset.json \
  --dry-run

node scripts/snapshot-reserves.mjs \
  --network mainnet \
  --rail 0xReserveRail \
  --config assets/example-asset.json \
  --dry-run

node scripts/distribute-cashflow.mjs \
  --network mainnet \
  --rail 0xReserveRail \
  --asset-id DEMO-INVOICE-001 \
  --token native \
  --amount 1000000 \
  --config assets/example-asset.json \
  --dry-run
```

## Asset Config

`assets/example-asset.json` contains:

- Asset identity: ID, name, type, jurisdiction, currency, notional, maturity.
- Offchain commitments: `documentHash` and `metadataUri`.
- Reserve policy: `minCoverageBps`.
- Waterfall tranches: recipient, basis points, priority, label.
- Reserve sources: source label, amount, and source proof hash.

All tranche basis points must total `10000`. Reserve coverage must meet or
exceed `minCoverageBps`.

## Notes

ReserveRail is designed for hackathon-grade RWA automation and agent workflows.
It commits document hashes, reserve proof roots, coverage math, and waterfall
events to Pharos. It does not replace legal agreements, custodian audits, KYC,
or securities compliance.

## Live Atlantic Testnet Smoke Test

ReserveRail was tested live on Pharos Atlantic testnet with a burner wallet.

| Item | Value |
| --- | --- |
| Rail contract | `0x28094CbDb3643B435383a646f8e28859F632ae55` |
| Deploy tx | `0x0d83088f08e1737fadb1a83c83e43800dadc37c2ed9cbf8f2d1a5c81c9bb3dd0` |
| Register asset tx | `0xfc4a66dacfe7ad16291ed598322a0f729da2bc37a0ec6b6bb6d0f1f4e5327349` |
| Configure waterfall tx | `0x1c4d317d5917d962c6955c621179c8b54023505c6843caccde2a0b89a972b243` |
| Reserve snapshot tx | `0xba1066204b2f469b6912b1bbcc733befc435ea6a004de37ce8104f6d5a456552` |
| Deposit cashflow tx | `0xe359f1c4f469d8b07e4e48565af1dbf57bd791a825957b07a7ca663fa38b34bb` |
| Record cashflow tx | `0x0707a81164db06c1fffeb8034d2d3072b6b800b35889ce62fd281fa9cc013fd1` |
| Distribute cashflow tx | `0xffa49779a9b8da1c59fe2f4946e4c6d91a73576e77cdb8ad8e7780c74359ad51` |

Explorer: https://atlantic.pharosscan.xyz/
