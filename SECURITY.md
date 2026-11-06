# SECURITY.md

Findings table. Severity: CRITICAL, HIGH, MED, LOW. Status: OPEN, FIXED, WAIVED, ACCEPTED.

| ID | Severity | Area | Description | Owner | Status | Verified by |
|----|----------|------|-------------|-------|--------|-------------|
| S-001 | HIGH | Auth transport (T-008) | `x-wallet` header claims any bound wallet with no per-request signature, so a caller can post, comment, extend, or edit as another bound user. Unbound wallets are rejected and the feed only shows author-in-registry posts, so injection from outside the registry is impossible, and damage is bounded by the per-wallet rate limit. V1 has no session or signature mechanism in the spec. Fix for V2: per-action wallet signatures (SIWE-style) on every write. | Backend B | OPEN, needs user waiver or V2 fix before T-008 goes DONE | — |
| S-002 | MED | Registry concurrency (T-003) | The single-writer queue is per process. Two server instances sharing one `data/registry.json` (or rate-limit file) could double-register under race. V1 runs one instance. Fix for V2: file lock or single-writer service. | Backend A | ACCEPTED (V1 single instance) | code read 2026-11-06 |
| S-003 | LOW | Verify failure path (T-006) | If the fetch to the verify API throws at the network level, the route throws to a Next 500 page instead of the JSON 400. Fail-closed (no binding), but the client sees an unshaped error. | Backend A | OPEN | code read 2026-11-06 |
| S-004 | INFO | Bundle scan (T-015) | `.next/static` contains no secret names, no schema tags, no app nullifiers. `nullifier` string hits are IDKit library internals only. | Security | FIXED (clean) | grep 2026-11-06 |

## M1 audit (identity layer), 2026-11-06

- Secrets: `.env.local` and `data/` gitignored and untracked. No `NEXT_PUBLIC_*` secret; the four public World values are identifiers visible in every proof request by design. `RP_SIGNING_KEY`, `SPONSOR_PRIVATE_KEY`, `ARKIV_ACCESS_KEY` appear only in server code. No secret names in `.next/static`.
- Registry: UNIQUE on lowercased nullifier and wallet, invalid formats rejected, atomic check plus insert via per-path single-writer queue and tmp plus rename writes. `data/` dir auto-created.
- RP signature: server-side `signRequest` only, single fixed action enforced with 400 `bad-action`, snake_case response per contract, generic 500 without leakage when the key is missing.
- Verify: IDKit result forwarded as-is to `/api/v4/verify/{rp_id}` with server-side `rp_id`, expected environment enforced before the call and on the response, action matched, `signal_hash` recomputed with `hashSignal` over the lowercased wallet so tampered signals fail closed, nullifier extracted and registered with 409 mapping. Nullifier returned only to the verifying caller, never logged (no `console.log` in server code).
- Errors: generic codes only, no stack traces, paths, or env values.

## M2 audit (content layer), 2026-11-06

- Spoof filter: feed queries `ownedBy(sponsor)` only; author allowlist enforced in code. Live-verified: the probe entity under our tag from an unregistered wallet is hidden.
- AuthZ: extend and edit require stored-author equality plus a registry binding, else 403. Live-verified: no-wallet 403, bogus key 404, non-owner extend and edit 403, zero chain writes. Comments have no edit or extend routes.
- Validation: days allowlist, 128B title, 5KB body and comment caps enforced server-side in both routes and the shared validators. Client guards mirror but never replace them.
- Rate limit: 5 posts per day per bound wallet, file-backed and restart-safe, enforced server-side before any chain write, 429 with no bypass via headers. Window reset and isolation covered by tests.
- Errors: chain failures map to generic 403 or 404. No schema tags, access keys, RPC URLs, or nullifiers in UI or API responses beyond the contract.
