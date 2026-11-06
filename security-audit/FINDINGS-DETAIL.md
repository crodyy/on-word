# Findings detail (run-2: medium and above)

## forum/write-auth-unverified-x-wallet-header (HIGH)

- Ordered trace: `app/api/posts/route.ts:15` (POST reads self-claimed header; membership-only gate) -> `app/api/comments/route.ts:57`, `app/api/posts/[key]/extend/route.ts:12`, `app/api/posts/[key]/edit/route.ts:12` (same gate on all write entry points) -> `lib/registry/store.ts:110` (`getBinding` resolves the header string, no secret) -> `lib/arkiv/manage.ts:34` (`assertOwner` string-compares the same header) -> sinks `app/api/posts/route.ts:48`, `app/api/comments/route.ts:88`, `lib/arkiv/manage.ts:41` (entity created/extended/patched for the header wallet).
- Attacker / resource: any network caller as principal; any bound wallet's posting and owner-only powers as the affected capability. Bound wallets are enumerable from `owner`/author fields in the public feed.
- Native input: HTTP POST with header `x-wallet: <victim bound wallet>` and an otherwise-valid JSON body. No signature, session, or cookie exists on any path (full reads of all four routes plus `manage.ts`/`store.ts` confirm absence).
- Observed result: source shows membership-only 403 gates; the repo suite passes with 403 behavior driven only by header presence/membership. Each write lands under the victim's binding.
- Conditions: victim wallet registry-bound (public); attacker can send arbitrary headers.
- Fix and regression: verify a wallet-signed nonce/challenge (or verify-proof-bound session) server-side on every write; keep `x-wallet` as a hint. Regression: bound wallet without valid signature must 403 on all four routes.

## forum/signup-bind-without-wallet-ownership (HIGH)

- Ordered trace: `app/signup/page.tsx:145` (manual paste entry) -> `page.tsx:86` (claimed wallet sent with proof, no signature) -> `lib/worldid/verify.ts:59` (format-only check) -> `:69` (expected signal derived from claimed wallet) -> `:71` (absent `signal_hash` skips the check) -> `:76` (proof forwarded as-is; wallet never sent to World) -> `:84` (action gate fails open on omission) -> `:97` (`store.register`) -> `lib/registry/store.ts:100` (victim wallet permanently reserved; later owner gets 409).
- Attacker / resource: any World-verified user as principal; the victim wallet's permanent bindability as the affected resource.
- Native input: signup UI with pasted victim address plus the attacker's own valid World proof; variant omits `signal_hash` from `responses[]`.
- Observed result: source trace ends in a permanent reservation with no wallet-ownership challenge and no World-signal confirmation anywhere on the path (the verify-response shape has no signal field to confirm against).
- Conditions: attacker passes own World verification; victim address valid and unbound; V1 has no unbind path.
- Fix and regression: injected-wallet only plus a wallet signature over a server challenge before `register()`; strict fail-closed signal/action match. Regression: unowned-address binding and omitted-`signal_hash` binding must both fail.

## forum/comments-no-rate-limit (MEDIUM)

- Ordered trace: `app/api/comments/route.ts:56` (POST entry: binding, shape, parent checks) -> `:75` (parent resolved, still no throttle) -> `:88` (`createCommentEntity` via the sponsor client) with no `checkAndRecord` anywhere on the path; contrast `app/api/posts/route.ts:38-45` (throttle-then-write).
- Attacker / resource: a bound identity as principal; sponsor tGLM spend as the affected resource.
- Native input: repeated `POST /api/comments` with a bound `x-wallet` and valid `{postKey, body}` past 5/day.
- Observed result: static reachability confirmed — every request reaches a sponsor-signed chain write with no 429 path. Each success is a paid entity.
- Conditions: one bound wallet; one unexpired sponsor-owned parent post.
- Fix and regression: `checkAndRecord` with a separate comments limit/path before the write, 429 on excess; regression test expects the 6th rapid comment to 429 with no chain write.
