# Architecture (run-2, commit e351be5)

Next.js 14 App Router + TypeScript. Server routes under `app/api/`; client
pages under `app/` (`signup`, `feed`, `post/new`, `post/[key]`).

## Trust boundaries

- **World proof -> binding.** `POST /api/rp-signature` mints an RP-signed
  request (server `RP_SIGNING_KEY`). `IDKitRequestWidget` (staging,
  `orbLegacy({signal: wallet})`, config now fetched at runtime from new
  `GET /api/world-config`) collects the proof. `POST /api/verify-proof`
  forwards it as-is to
  `https://developer.world.org/api/v4/verify/{rp_id}`, checks env/action/
  signal_hash, accepts the nullifier from top level or `results[]`, then
  `register()` lowercased nullifier <-> wallet with UNIQUE constraints
  (single-process queue, tmp+rename, `data/registry.json`). Exact replays are
  now idempotent successes.
- **Bound wallet -> Arkiv writes.** `x-wallet` header + registry membership is
  the ONLY caller check on posts/comments/extend/edit. No per-request wallet
  signature, session, or cookie. Sponsor key (`SPONSOR_PRIVATE_KEY`) signs all
  chain writes server-side; `author` column is server-set to the bound wallet.
- **Arkiv reads -> feed.** `.ownedBy(sponsor)` + author-in-registry + expiry
  filter for live; new `GET /api/posts/[key]` thread read uses the same
  filters plus body select. Local `data/cache.json` (v2, author-as-owner)
  supplies archived cards.
- **Client identity hint.** `app/lib/wallet.ts` keeps the bound wallet in
  `localStorage`; pages send it as `x-wallet`. Self-claimed, server only
  checks membership. Signup still offers manual address paste as fallback.

## Principals

Lower-trust: any World-verified user (barrier ~zero on staging simulator),
anonymous readers. Higher-trust: sponsor key holder (server env), World/RP
backend (verify API), local disk (registry/cache/rate files).

## What is NOT a boundary here

Disk files (trusted host), World/RPC responses (validated where used:
env/action/signal checks), React rendering (escaped, no raw-HTML sinks found).

## Coverage consequences (prior run-1 vs e351be5)

Carried same-source: F-001 write-auth, F-002 signup-ownership, F-003
comments-throttle, F-004 pinned deps, F-006 comment-count, F-007
rate-record-order (hunters exclude these root causes; verifiers re-check).
Changed-source revalidation: F-005 feed-archived-allowlist (cache v2,
owner=author mapping). New work: world-config endpoint, thread-detail read,
registry idempotent replay, rate-limit queue, verify nullifier-from-results,
thread-body rendering. Still externally blocked: NV-1 (key value), NV-2
(simulator round trip), NV-3 (deployment controls).

## Companion selection

- `WEB-PROTOCOL-AND-AUTH.md` (Core discipline + Account linking and identity
  collision): signup/verify/binding boundary, world-config identity inputs.
- `DATA-ISOLATION-AND-LIFECYCLE.md` (Core discipline + Missing tenant or
  owner enforcement + Search, cache, and index ACL drift): feed allowlist,
  cache v2, archived loop, count scoping.
- Ordinary classes from `ATTACK-CLASSES.md` (Access control, Business logic,
  Feature abuse and data leakage, Obvious things) are self-contained.
- Excluded: AI/LLM (no models/agents), MEMORY-SAFETY (TypeScript/Next only),
  PROTOCOLS-RPC (Arkiv SDK is a client lib, no custom protocol server),
  CLOUD-AND-DEPLOYMENT (no IaC/containers; deploy controls out of scope,
  NV-3), DESKTOP-MOBILE-LOCAL-IPC (no native bridges), CLIENT-SIDE companion
  (no postMessage/storage-trust boundary beyond localStorage hint, covered by
  ordinary rendering review), RESOURCE-EXHAUSTION companion (rate-limit
  logic reviewed under ordinary Business logic; no shared infra to exhaust),
  SUPPLY-CHAIN companion (lockfile present, audit via npm; no CI/release
  signing in scope), HTTP framing/cache classes (single Next server, no
  custom proxy/parser in source).
