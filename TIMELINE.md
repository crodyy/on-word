# TIMELINE

Last updated: 2026-11-07 07:00 IST

## Summary
Done: 25 | In progress: 0 | In review: 8 | Blocked: 0 | Todo: 0

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
| T-010 | POST /api/comments (fixed 1d, was 7d) | Backend B | T-007 | DONE | Live 7d probe stands as history (tx 0x68f49b5b.., delta 302402 blocks); fixed expiry now 1d, see T-027 | 2026-11-07 |
| T-011 | Extend + edit post routes (owner-only) | Backend B | T-008 | IN_REVIEW | live curl: no-wallet 403, bogus key 404, non-owner extend/edit 403, zero txs; success paths deferred to round-trip (need registered author) | 2026-11-06 |
| T-012 | Signup screen + IDKit widget | Frontend | T-004, T-005, T-006 | IN_REVIEW | signup with Connect-wallet button plus manual fallback, orbLegacy flow, locks-forever warning, inline 409s; needs simulator pass | 2026-11-06 |
| T-013 | Feed screen | Frontend | T-004, T-009 | IN_REVIEW | feed with live/archived, countdown, comment counts, visitor banner, loading/empty/error states; shows 180-char body excerpts (T-029); needs live-post rendering check | 2026-11-07 |
| T-014 | New-post + thread screens | Frontend | T-004, T-008, T-010, T-011 | IN_REVIEW | composer 5KB guard + 1h/1d/3d/5d radio (T-028); thread in-place edit (Edit top-right, Save/Cancel, T-026) + Lifetime section (T-026) + 1-day comment copy (T-027); needs live round-trip | 2026-11-07 |
| T-015 | Taste-skill gate + preflight | Frontend | T-012, T-013, T-014 | DONE | shoot+perf 0 FAIL (2 WARN bundle size, reason logged); consistency 49 PASS, 5 marketing-rule FAILs with stated app-scope reasons; 2 critique rounds; preflight clean | 2026-11-06 |
| T-016 | Security audit M1 (identity layer) | Security | T-006 | DONE | audit done; re-audit 2026-11-07: S-001 fixed by T-021/T-022/T-023 (per-write wallet signatures), S-003 fixed (route returns JSON 400 on fetch throw), S-002 accepted, S-004 sweep clean; SECURITY.md removed per user direction (T-030) | 2026-11-07 |
| T-017 | Security audit M2 (content layer) | Security | T-011, T-014 | DONE | audit done, no CRITICAL/HIGH in content layer (S-001 tracked under T-016) | 2026-11-06 |
| T-018 | Final build + fresh-identity round trip | Orchestrator | T-015, T-016, T-017 | DONE | `vitest run` 64/64 green, `npm run build` passes (2026-11-07); Security sign-off current (T-030); live round trip performed and confirmed by user on fresh identity (signup, 409s, post, comment, extend, 403, 429 all as expected) | 2026-11-07 |
| T-019 | Arkiv hackathon feedback docs (arkiv/*.md) | Orchestrator | - | DONE | four files exist under arkiv/; every technical claim cross-checked against PROMPT.md, AGENTS.md, LOG.md decisions; planned-vs-implemented clearly marked | 2026-11-06 |
| T-020 | Audit run-2 content-layer fixes (MEDIUM + 3 LOWs) | Backend B | T-008, T-009, T-010 | DONE | comments 5/day throttle with own rate path + 429, releaseSlot compensation on failed writes (posts + comments), upsertCache ingestion filter + prune + archived allowlist re-check, countComments ownedBy(sponsor); vitest 45/45 (6 new), tsc clean, build green | 2026-11-06 |
| T-021 | Audit run-2 HIGH write-auth (wallet signature/session) | Backend A | T-020 | DONE | server write-auth: lib/auth/challenge (issue/consume/verify, 8 tests), GET /api/auth/challenge, all 4 write routes require fresh signature (bound wallet without signature 403s on all four, incl. new manage-route tests); vitest 57/57, tsc clean | 2026-11-06 |
| T-022 | Audit run-2 HIGH signup wallet-ownership | Backend A | T-021 | DONE | verifyProof requires wallet signature over server nonce before register + fail-closed signal/action; verify-proof route passes signature/nonce; vitest 12/12 verify tests; lane note: signature tests use generated keys | 2026-11-06 |
| T-023 | Frontend wallet-signing (signup + write pages) | Frontend | T-021, T-022 | DONE | injected-wallet only (manual paste removed), challenge+personal_sign on signup and all write pages via signedWriteHeaders; lane note: Backend pairing agent implemented, needs Frontend review; live simulator pass still required | 2026-11-06 |
| T-024 | Hardening batch (headers, README, sweep) | Orchestrator | T-023 | DONE | baseline security headers in next.config.mjs (nosniff, referrer, SAMEORIGIN; HSTS/CSP stay deploy-time), README limits rewritten for signature auth, sweep clean: no schema tags/secrets/nullifiers in app/ or .next/static, no dangerouslySetInnerHTML | 2026-11-06 |
| T-025 | Feed count + hero/header session fixes | Frontend | T-020, T-023 | DONE | countComments counts by parent entity key not postKey column (was always 0; live proof byEntity 1 vs byColumn 0, feed curl 1/0); home is wallet-aware (bound sees Go-to-feed/New-post); SiteHeader re-reads wallet on route change | 2026-11-06 |
| T-026 | Thread in-place edit + Lifetime section | Frontend | T-014 | IN_REVIEW | Edit button top-right of title; title/body become inputs in place; Save changes calls existing edit route; section renamed Author controls to Lifetime, Extend right; tsc clean; committed, needs live round-trip | 2026-11-07 |
| T-027 | Comment fixed expiry 7d to 1d | Backend B | T-010 | IN_REVIEW | COMMENT_DAYS 7 to 1 (create path follows it), thread copy to 1 day, probe script to fromDays(1); vitest 61/61, tsc clean; committed; contract deviation vs PROMPT.md 7d and AGENTS.md 7d | 2026-11-07 |
| T-028 | 1-hour post lifetime | Backend B + Frontend | T-008 | DONE | lib/arkiv/posts validates days 1/3/5 or hours 1 (fromHours), create/extend routes accept either, composer + thread extend offer 1h; vitest 62/62, tsc clean, build green; contract deviation vs PROMPT.md/AGENTS.md day-only lifetimes | 2026-11-07 |
| T-029 | Feed body excerpts | Backend B + Frontend | T-009 | DONE | fetchLivePosts selects body, splitFeed exposes 180-char excerpt, cache v3 stores excerpts (old caches reset once), feed renders excerpt live+archived; vitest 64/64, tsc clean, build green | 2026-11-07 |
| T-030 | Security re-audit + remove SECURITY.md | Security | T-016 | DONE | all findings re-verified against code (S-001/S-003 fixed, S-002 accepted, S-004 sweep clean), 32 auth tests green; file deleted per user direction | 2026-11-07 |
| T-031 | KV-backed state (registry, nonces, rate limits, feed cache) | Backend A + B | T-003, T-021 | DONE | `vitest run` 75/75 (11 new kv-state tests), `tsc` clean, `npm run build` green; file backend kept for local dev, KV used when configured | 2026-11-07 |
| T-032 | Brand rename Human-Only Forum to On-Word | Frontend + Orchestrator | - | DONE | PROMPT.md, README.md, layout title/footer, header aria/alt all On-Word; grep clean of old name in UI strings | 2026-11-07 |
| T-033 | Post-not-found + KV orphan fixes | Backend A + B + Frontend | T-031 | DONE | KV registry compensates nullifier claim on wallet-reused (no stuck lockout); POST write-through caches new row; thread falls back to direct entity read (getEntity) before missing; vitest 76/76, tsc clean, build green | 2026-11-07 |

## Milestones
- [ ] M1 Registry + RP signature (T-003, T-005, T-016 partial)
- [ ] M2 Signup lock working with 409 on duplicates (T-006, T-012)
- [ ] M3 Posts on Arkiv with explorer tx (T-007, T-008)
- [ ] M4 Feed hides unbound-tag spoof (T-009, T-013, T-017 partial)
- [ ] M5 Comments with fixed expiry, no edit UI (T-010, T-014 partial)
- [ ] M6 Extend/edit with owner authz (T-011, T-017)
- [ ] M7 Rate limit 429 on 6th post (T-008)
- [x] M8 Final build + round trip + security sign-off (T-015, T-018)

## File ownership (disjoint)
- Orchestrator: TIMELINE.md, LOG.md, lib/types.ts, scaffold configs, README.md
- Frontend: app/**/page.tsx, app/components/**, styling, fonts (never app/api/**, lib/arkiv/**, lib/worldid/**)
- Backend A: app/api/rp-signature/**, app/api/verify-proof/**, lib/worldid/**, lib/registry/**, tests/registry.test.ts
- Backend B: app/api/posts/**, app/api/comments/**, lib/arkiv/**, data/cache.json, tests/arkiv.test.ts
- Security: SECURITY.md only (plus security test files)
