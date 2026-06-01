# Proof Report Schema

`scripts/generate-proof-report.mjs` writes a JSON report with:

- `skill`: always `reserverail`
- `reportVersion`: schema version
- `generatedAt`: ISO timestamp
- `network`: Pharos network name, chain ID, explorer URL
- `rail`: ReserveRail contract address
- `assetId`: human-readable asset ID
- `assetKey`: bytes32 onchain asset key
- `asset`: source asset config
- `reserveProof`: total reserves, coverage bps, proof root, source hashes
- `transactions`: optional deploy, issue, waterfall, reserve, and distribution
  transaction summaries
- `notes`: human review caveats

The report is meant to be attached to hackathon submissions, issuer review
packets, or treasury settlement records.
