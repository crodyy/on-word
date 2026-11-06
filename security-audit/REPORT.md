# Security audit report (run-2, standard profile)

- Source ref: commit `e351be5` (clean tracked tree), scope `app lib tests package.json .env.example next.config.mjs`.
- Execution: sandboxed source-and-local-only. No target-controlled sandboxed PoCs were run (no OS-enforced sandbox on this platform); validation is source re-reads by independent agents plus the repo's own suite (`vitest run` 39/39 on this ref) and `tsc --noEmit` clean, both executed parent-side.
- Official schema validators (`validate-findings.cjs`, `validate-coverage-ledger.cjs`) refuse to run on this platform (require POSIX no-follow open); an equivalent manual conformance check against `report-schema.json` passes for all 10 records (required keys, no extra keys, enums, fingerprint pattern, trace shape/order, sorted by fingerprint).
- Prior run: run-1 (commit `3fcb4bc`, 7 confirmed in legacy format + 3 NV). Carried same-source after re-verification: F-001 write-auth, F-002 signup-ownership, F-003 comments-throttle, F-006 comment-count, F-007 rate-record-order. Changed-source revalidation: F-005 feed-archived-allowlist (still present, new evidence). New surfaces reviewed: `GET /api/world-config`, `GET /api/posts/[key]`, registry idempotent replay, rate-limit queue, verify nullifier-from-results, thread-body rendering. F-004 (pinned deps) re-examined and REJECTED as a confirmed finding (no reachable sink; kept as hygiene).
- Coverage: 15 ledger units, 8 covered, 7 candidate (6 unique finding fingerprints; the signup-ownership root cause spans two units). Post-wave critic added 1 unit (comments-list trust filter, covered). Final-clean critic: no missing units, no reassignments. No deferred, blocked, or out-of-scope units.
- Hunter deviation note: hunter-b returned short unit IDs (U1-U4) instead of full coverage IDs; the parent remapped them by reviewed-paths order (U1=feed-cache, U2=thread-detail, U3=rate-queue, U4=rendering). No content was altered by the remap; Phase-5 verifiers independently re-checked the claims.

## Posture summary

Identity binding and write authorization remain self-claimed: the two HIGH findings from run-1 persist unchanged on identical source. Anyone knowing a bound wallet can write as it, and anyone can bind any wallet they name. The content layer adds one MEDIUM (unthrottled comments spend sponsor gas without bound) and three LOWs (archived-list ACL drift, count inflation, quota burn on failed writes). No secret leakage, injection sink, or reachable dependency exploit was found.

## Confirmed findings

| Severity | Title | Boundary | Observed result |
|---|---|---|---|
| HIGH | Write routes authenticate solely via self-claimed x-wallet header | bound-wallet -> Arkiv writes | Membership-only 403s; no ownership challenge on any of 4 write routes |
| HIGH | Signup binds arbitrary pasted wallet without wallet-ownership proof | World-proof -> binding | Format-only wallet check; fail-open signal/action gates; permanent reservation |
| MEDIUM | Comment creation has no throttle while posts do | sponsor-spend containment | Unlimited sponsor-signed comment writes per bound identity |
| LOW | Feed archived path emits unregistered-author rows hidden while live | feed ACL / derived cache | Hidden-while-live title visible as archived after expiry to anonymous readers |
| LOW | Comment counts include other-owner same-tag entities | feed counts vs thread list | Count exceeds displayed list by construction |
| LOW | Post rate slot burned before chain write with no rollback | rate accounting | Failed writes exhaust 5/day quota |

### forum/write-auth-unverified-x-wallet-header (HIGH)

- Location: `app/api/posts/route.ts:15`, `app/api/comments/route.ts:57`, `app/api/posts/[key]/extend/route.ts:12`, `app/api/posts/[key]/edit/route.ts:12`, via `lib/registry/store.ts:110` (`getBinding`) and `lib/arkiv/manage.ts:34` (`assertOwner`).
- Lower-trust principal: any network caller. Bound wallets are public (`lib/arkiv/feed.ts:168`, `lib/types.ts:37`).
- Reproduction (source-demonstrated): set `x-wallet` to a victim's bound address and POST to any write route with an otherwise-valid body; no signing step is required or checked. Suite `tests/posts-route.test.ts` passes, consistent with 403s driven only by header presence/membership.
- Conditions: victim wallet registry-bound (public in feed); attacker can send arbitrary headers.
- Impact: full impersonation including owner-only extend/edit; breaks human-only attribution.
- Fix: require a wallet-signed nonce/challenge (or a session established at verify-proof) verified server-side on every write; keep `x-wallet` as a hint only. Regression test: bound wallet without signature must 403.

### forum/signup-bind-without-wallet-ownership (HIGH)

- Location: `app/signup/page.tsx:145-162` (manual paste), `:86-100` (unsigned send), `lib/worldid/verify.ts:59-60` (format-only), `:69-74` (signal pre-check skips absent `signal_hash`), `:26-38` (no World-returned signal field), `:84` (action gate fails open on omission), `:97-99` (`store.register`), `lib/registry/store.ts:88-108` (permanent UNIQUE reservation).
- Lower-trust principal: any World-verified user (staging barrier ~zero).
- Reproduction (source-demonstrated): paste a victim address, complete own World verification, submit `{idkitResponse: own proof, wallet: victim}` (optionally omitting `signal_hash`); binding is created for the unowned wallet and the victim later gets 409 `wallet-reused`.
- Impact: permanent V1 lockout of the victim wallet plus an attacker-held binding enabling impersonation.
- Fix: remove manual entry AND require a wallet signature over a server challenge before `register()`; enforce strict World-returned signal/action equality, failing closed on missing fields.

### forum/comments-no-rate-limit (MEDIUM)

- Location: `app/api/comments/route.ts:56-100` (no `checkAndRecord`); contrast `app/api/posts/route.ts:38-45`; sponsor client `lib/arkiv/client.ts:23-25`, `lib/arkiv/comments.ts:56-70`.
- Reproduction: as a bound identity, POST comments in a loop past 5/day; each mints a sponsor-signed entity with no 429.
- Impact: unbounded sponsor gas spend per bound identity.
- Fix: `checkAndRecord` with a separate comments limit/path before `createCommentEntity`, 429 on excess; consider per-post caps.

### forum/feed-archived-allowlist-drift (LOW)

- Location: `lib/arkiv/feed.ts:99-110` (live filter) vs `:111-126` (archived, no allowlist) and `:128-144` (`upsertCache` ingests all sponsor-owned rows fed by `:151-184`); served by anonymous `GET /api/posts` (`app/api/posts/route.ts:66-84`).
- Reproduction: cache a sponsor-owned unregistered-author row while live (hidden), let it expire, GET the feed: the title appears under `archived`.
- Impact: disclosure of feed-hidden titles to anonymous readers. Titles only.
- Fix: filter `upsertCache` by the allowlist at ingestion and re-check it in the archived loop; regression test spoof-cached-then-expired stays hidden.

### forum/comment-count-missing-ownedBy (LOW)

- Location: `lib/arkiv/feed.ts:186-190` (no `.ownedBy`) vs `app/api/comments/route.ts:19-31` (sponsor + allowlist + expiry); used at `app/api/posts/route.ts:74-78`.
- Impact: display-only count inflation by foreign-owner same-tag rows.
- Fix: scope the count with `.ownedBy(sponsor)` (plus allowlist/expiry parity) or count from the same filtered fetch; regression test with a foreign-owner row.

### forum/ratelimit-record-before-write (LOW)

- Location: `app/api/posts/route.ts:38-55`; `lib/arkiv/rateLimit.ts:54-70` (no rollback API).
- Impact: failed chain writes permanently burn daily quota; no bypass.
- Fix: record after successful write (keeping the serialize queue) or add `releaseSlot` compensation on failure.

## Needs validation (no severity; leads, not findings)

| Title | Trace | Blocker | Next step |
|---|---|---|---|
| RP signing key value correctness | `app/api/rp-signature/route.ts:1` | Local signing succeeds with any key; World-side trust needs a live pass | Simulator signup: verify-proof 200 proves it |
| Simulator end-to-end round trip | `app/api/verify-proof/route.ts:1` | Needs a human + World App + fresh identity | Signup 200, 409s, bound post/comment/extend, 6th-post 429 |
| Production deployment controls | `next.config.mjs:1` | Hosting/TLS/headers/secrets outside repo | Harden at deploy; keep audit dir out of image |

## Hardening notes (non-findings)

- Rejected F-004: `next` 14.2.18 pin and postcss/vite/vitest ranges carry advisories, but the named next advisories need Server Actions, `next/image`, or middleware (all absent from the tree) or the dev server; toolchain items are dev-only with no user-input sink. Upgrade next/postcss when convenient; re-audit with advisory IDs and reachability.
- Comments GET does not re-check parent visibility: comments on a hidden/expired parent stay retrievable by exact parent key, but only allowlisted-author, unexpired comment bodies are returned and keys are unguessable. Documented behavior; consider parent-visibility parity if the threat model changes.
- `GET /api/posts` and `GET /api/posts/[key]` return 500 with a generic `bad-request` code on chain failure (status/code mismatch); no leakage, but normalize to 502/503 handling if clients must distinguish.
- No security headers are set in `next.config.mjs`; assess at deployment (covered by NV-3).
- `verify-proof` logs a safe server-side reason string while returning generic `verify-failed`; log strings are static and never carry proof/nullifier/wallet. Keep that invariant on every edit.

## Positive patterns

- Secrets (`RP_SIGNING_KEY`, `ARKIV_ACCESS_KEY`, `SPONSOR_PRIVATE_KEY`) appear only in server code; `.env.local` and `data/` are gitignored; world-config exposes public identifiers only.
- Thread/post/comment bodies render via JSX text interpolation only; no `dangerouslySetInnerHTML`, no `href`/`src` built from user text; comment bytes are server-encoded and decoded through non-throwing paths.
- Registry and rate-limiter use per-path single-writer queues with tmp+rename writes; exact verification replays are idempotent without granting new capability.
- New read paths (`world-config`, thread detail, comments list) enforce the same sponsor/allowlist/expiry filters as the feed with no oracle differences between hidden and missing.
