# TIMELINE

Last updated: 2026-11-06 22:00 IST

## Summary
Done: 13 | In progress: 0 | In review: 6 | Blocked: 0 | Todo: 4

## Tasks
| ID    | Task                              | Owner      | Depends on | Status | Acceptance (evidence)          | Updated |
|-------|-----------------------------------|------------|------------|--------|--------------------------------|---------|
| T-001 | Scaffold Next.js 14 TS app + deps | Orchestrator | -        | DONE   | `npm run build` passes; package.json holds next@14, react, typescript, @worldcoin/idkit, @worldcoin/idkit-core, viem, @arkiv-network/sdk, vitest | 2026-11-06 |
| T-002 | Rabdi connectivity + sponsor funding | Backend B | T-001     | DONE | chain 7794095 block 282519, sponsor balance 10 tGLM (check-rabdi.mjs; key normalized with 0x prefix) | 2026-11-06 |
| T-003 | Registry lib TDD (UNIQUE nullifier/wallet) | Backend A | T-001 | DONE | `vitest run` green 8/8; typecheck clean (identity sign-off stays with T-016, may reopen) | 2026-11-06 |
| T-004 | Shared TS contracts (lib/types.ts) | Orchestrator | T-001 | DONE | `npx tsc --noEmit` clean; types mirror PROMPT.md section 8 (rp-signature, verify-proof, posts, feed, extend/edit, comments, ApiError) | 2026-11-06 |
| T-005 | POST /api/rp-signature | Backend A | T-001 | DONE | curl good action 200 {sig, nonce, created_at, expires_at}; wrong action 400 bad-action (user replaced RP key with real 32-byte value) | 2026-11-06 |
| T-006 | POST /api/verify-proof + binding | Backend A | T-003, T-005 | IN_REVIEW | lib/worldid/verify.ts + route written, vitest 16/16 green, build passes; REMAINING: simulator signup x2 with 409s (needs user) | 2026-11-06 |
| T-007 | Arkiv schemas + server write path | Backend B | T-001, T-002 | DONE | live createEntity 1d on Rabdi: entityKey 0xb6e0a9.., expiresAt block 326542, tx 0x5bf37f04.. status success (explorer link in LOG) | 2026-11-06 |
| T-008 | POST /api/posts + rate limit | Backend B | T-003, T-007 | IN_REVIEW | route + file-backed 5/day limit, vitest 25/25, build passes; REMAINING: live 6-post 429 run (belongs to step-7 task, costs 5 txs) | 2026-11-06 |
| T-009 | GET /api/posts feed + cache | Backend B | T-008 | DONE | live curl returns {posts:[],archived:[]} with probe hidden (unregistered author); cache.json upsert verified then cleaned; vitest 30/30 | 2026-11-06 |
| T-010 | POST /api/comments (fixed 7d) | Backend B | T-007 | DONE | live comment on probe post: 7d expiry (delta 302402 blocks), count 1, tx 0x68f49b5b..; validation unit tests; no edit/extend routes | 2026-11-06 |
| T-011 | Extend + edit post routes (owner-only) | Backend B | T-008 | IN_REVIEW | live curl: no-wallet 403, bogus key 404, non-owner extend/edit 403, zero txs; success paths deferred to round-trip (need registered author) | 2026-11-06 |
| T-012 | Signup screen + IDKit widget | Frontend | T-004, T-005, T-006 | IN_REVIEW | signup with Connect-wallet button plus manual fallback, orbLegacy flow, locks-forever warning, inline 409s; needs simulator pass | 2026-11-06 |
| T-013 | Feed screen | Frontend | T-004, T-009 | IN_REVIEW | feed with live/archived, countdown, comment counts, visitor banner, loading/empty/error states; needs live-post rendering check | 2026-11-06 |
| T-014 | New-post + thread screens | Frontend | T-004, T-008, T-010, T-011 | IN_REVIEW | composer with 5KB guard + 1/7/30d radio; thread with countdown, owner controls, comments; needs live round-trip | 2026-11-06 |
| T-015 | Taste-skill gate + preflight | Frontend | T-012, T-013, T-014 | DONE | shoot+perf 0 FAIL (2 WARN bundle size, reason logged); consistency 49 PASS, 5 marketing-rule FAILs with stated app-scope reasons; 2 critique rounds; preflight clean | 2026-11-06 |
| T-016 | Security audit M1 (identity layer) | Security | T-006 | IN_REVIEW | audit done, SECURITY.md written; 1 HIGH open (S-001 auth transport, needs waiver/V2); T-006 stays IN_REVIEW | 2026-11-06 |
| T-017 | Security audit M2 (content layer) | Security | T-011, T-014 | DONE | audit done, no CRITICAL/HIGH in content layer (S-001 tracked under T-016) | 2026-11-06 |
| T-018 | Final build + fresh-identity round trip | Orchestrator | T-015, T-016, T-017 | TODO | `vitest run` green, `npm run build` passes, round trip works (signup, post, comment, extend, 409 x2, 403, 429), Security final sign-off, README caveats written | 2026-11-06 |
| T-019 | Arkiv hackathon feedback docs (arkiv/*.md) | Orchestrator | - | DONE | four files exist under arkiv/; every technical claim cross-checked against PROMPT.md, AGENTS.md, LOG.md decisions; planned-vs-implemented clearly marked | 2026-11-06 |
| T-020 | Audit run-2 content-layer fixes (MEDIUM + 3 LOWs) | Backend B | T-008, T-009, T-010 | DONE | comments 5/day throttle with own rate path + 429, releaseSlot compensation on failed writes (posts + comments), upsertCache ingestion filter + prune + archived allowlist re-check, countComments ownedBy(sponsor); vitest 45/45 (6 new), tsc clean, build green | 2026-11-06 |
| T-021 | Audit run-2 HIGH write-auth (wallet signature/session) | Backend A | T-020 | DONE | server write-auth: lib/auth/challenge (issue/consume/verify, 8 tests), GET /api/auth/challenge, all 4 write routes require fresh signature (bound wallet without signature 403s on all four, incl. new manage-route tests); vitest 57/57, tsc clean | 2026-11-06 |
| T-022 | Audit run-2 HIGH signup wallet-ownership | Backend A | T-021 | TODO | injected-wallet only (no manual paste), wallet signature over server challenge before register(), strict fail-closed signal/action; unowned-address and omitted-signal_hash bindings fail | 2026-11-06 |
| T-023 | Frontend wallet-signing (signup + write pages) | Frontend | T-021, T-022 | TODO | challenge fetch + personal_sign via injected wallet on signup/post/comment/extend/edit; manual paste removed; no x-wallet-only path remains in UI | 2026-11-06 |

## Milestones
- [ ] M1 Registry + RP signature (T-003, T-005, T-016 partial)
- [ ] M2 Signup lock working with 409 on duplicates (T-006, T-012)
- [ ] M3 Posts on Arkiv with explorer tx (T-007, T-008)
- [ ] M4 Feed hides unbound-tag spoof (T-009, T-013, T-017 partial)
- [ ] M5 Comments with fixed expiry, no edit UI (T-010, T-014 partial)
- [ ] M6 Extend/edit with owner authz (T-011, T-017)
- [ ] M7 Rate limit 429 on 6th post (T-008)
- [ ] M8 Final build + round trip + security sign-off (T-015, T-018)

## File ownership (disjoint)
- Orchestrator: TIMELINE.md, LOG.md, lib/types.ts, scaffold configs, README.md
- Frontend: app/**/page.tsx, app/components/**, styling, fonts (never app/api/**, lib/arkiv/**, lib/worldid/**)
- Backend A: app/api/rp-signature/**, app/api/verify-proof/**, lib/worldid/**, lib/registry/**, tests/registry.test.ts
- Backend B: app/api/posts/**, app/api/comments/**, lib/arkiv/**, data/cache.json, tests/arkiv.test.ts
- Security: SECURITY.md only (plus security test files)
