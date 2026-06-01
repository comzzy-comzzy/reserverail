# ReserveRail Safety Notes

ReserveRail performs onchain writes that can create permanent records and move
funds. Follow these defaults:

- Use `atlantic-testnet` for demos and review flows.
- Run `--dry-run` before every write.
- Never store private keys in config, GitHub, screenshots, or generated reports.
- Confirm the rail address, network, owner, asset ID, reserve proof root,
  tranche recipients, and payout amounts before writing.
- Do not use placeholder recipient addresses for live deployments.
- Keep offchain legal documents and custodian attestations available. The
  contract only stores hashes and reserve coverage commitments.
- For mainnet, verify token decimals and amount units before distribution.

ReserveRail intentionally separates local validation from onchain writes so an
agent can inspect a full plan before signing.
