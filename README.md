# Human-Only Forum (V1, closed)

A forum where 1 verified human equals 1 locked wallet. Posts and comments live on
Arkiv (Rabdi testnet) with paid lifetimes. Web3 hidden behind a Web2-feel UI.

Posts offer 1-hour, 1-day, 3-day, and 5-day lifetimes (the 1-hour option
exists for expiry testing). The feed shows a 180-character body excerpt under
each title; the full body lives on the thread view. Comments are fixed at 1 day.

## Status

V1 is feature-complete and closed. All builds green: `vitest run` 64/64,
`npx tsc --noEmit` clean, `npm run build` passes. Write auth and signup are
wallet-signature bound (run-2 HIGHs fixed, T-021 through T-023).

What was proven live on Rabdi: chain connectivity plus funded sponsor, schema
writes with transaction receipts (1-day post; comment probe with an exact
302402-block expiry made when the fixed comment expiry was 7 days, now 1 day),
the allowlist feed hiding an unregistered-author entity, and every
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
- Every write and every signup proves wallet ownership: a fresh server nonce
  signed with the bound key (personal_sign). The x-wallet header alone grants
  nothing. Nonces are single-use with a 10-minute life.
- Signup needs an injected wallet. There is no address-paste fallback.
- The challenge endpoint issues nonces for any well-formed address, including
  unbound ones (signup needs it). Issuance grants nothing without the key.
- Single server instance. The registry, rate-limit, and nonce stores are files
  with per-path serialized writes; they are not shared across instances.
- The feed cache (`data/cache.json`) is versioned. A version bump (v3 added
  excerpts) resets it once; archived items repopulate from the chain on the
  next load.
- Staging simulator only. No mainnet, no mobile native, no recovery flow.

## V2

V2 focuses on UI/UX changes. Scope to be defined.
