# Human-Only Forum (V1, closed)

A forum where 1 verified human equals 1 locked wallet. Posts and comments live on
Arkiv (Rabdi testnet) with paid lifetimes. Web3 hidden behind a Web2-feel UI.

## Status

V1 is feature-complete and closed. All builds green: `vitest run` 32/32,
`npx tsc --noEmit` clean, `npm run build` passes.

What was proven live on Rabdi: chain connectivity plus funded sponsor, schema
writes with transaction receipts (1-day post, 7-day comment with exact 302402-block
expiry), the allowlist feed hiding an unregistered-author entity, and every
403/404 path for posts, comments, extend, and edit with zero unintended chain writes.

What was not proven live: the World ID simulator round-trip (signup with 409s on
duplicates, posting as a bound wallet, the 6-post 429 run, owner extend/edit
success). The code paths are tested with mocks; they wait for a Developer Portal
setup plus a simulator pass.

## Setup

1. Copy `.env.example` to `.env.local` and fill it in. Server values stay
   server-only. The four `NEXT_PUBLIC_WORLD_*` values come from the Developer
   Portal and feed the IDKit widget.
2. Fund the sponsor wallet with tGLM from https://hub.arkiv.network/faucet.
3. `npm install`, `npm run dev`.

## Known limitations (V1)

- Comments are UI-frozen only, not cryptographically frozen. The entity owner can
  always patch through raw RPC.
- Expiration means disappearance from queries, not archival. The visible archive
  is the local `data/cache.json`, not chain history.
- Key loss means permanent lockout. The World ID to wallet binding cannot change.
- Write auth is a claimed `x-wallet` header checked against the registry (see
  SECURITY.md S-001). A caller can act as any *bound* wallet. V2 moves to
  per-action wallet signatures.
- Single server instance. The registry and rate-limit queues are per process.
- Staging simulator only. No mainnet, no mobile native, no recovery flow.

## V2

V2 focuses on UI/UX changes. Scope to be defined.
