# Needs validation (run-2)

These are source-grounded but externally blocked; they are not findings and carry no severity.

## NV-1 — RP signing key value correctness

- Trace: `POST /api/rp-signature` (`app/api/rp-signature/route.ts:1`) mints RP-signed requests consumed by the World widget; trust is decided World-side.
- Blocker: local `signRequest` succeeds with any well-formed key, so the 200 from `/api/rp-signature` proves nothing about World-side trust. Format is valid (`0x` + 64 hex); actions and environments are consistent across server env, widget config, and fallbacks.
- Owner plan: complete one simulator signup. `POST /api/verify-proof 200` proves the key; a World-side decline before any backend call disproves it. Key material must only be handled locally by the owner, never pasted into chat or logs. (Carried from run-1, unchanged.)

## NV-2 — simulator end-to-end round trip

- Trace: integrated flow through `app/api/verify-proof/route.ts:1` (signup), write routes (bound post/comment), extend/edit, and rate limits (`PROMPT.md:71` acceptance).
- Blocker: needs a human with World App/simulator plus a fresh wallet and identity; cannot be staged from source. Unit and route tests cover each branch with mocks (39/39 on this ref).
- Owner plan: signup (expect 200), re-signup same identity (409 worldid-reused), reused wallet (409 wallet-reused), bound post + comment, owner extend/edit success, 6th-post 429. Closes T-006/T-008/T-011/T-012. (Carried from run-1, unchanged.)

## NV-3 — production deployment controls

- Trace: deployment selected outside the repo; `next.config.mjs:1` is empty (no headers); `.gitignore:1` covers secrets and runtime data.
- Blocker: hosting, TLS, security headers, secret storage, and process topology live outside this repo and were not assessed.
- Owner plan: at deploy time enforce TLS, set security headers, keep sponsor/RP keys server-side, run a single instance, and keep the audit dir out of the image. (Carried from run-1, unchanged.)
