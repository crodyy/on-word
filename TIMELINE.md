# TIMELINE

Last updated: 2026-11-06 12:43 IST

## Summary
Done: 4 | In progress: 0 | In review: 0 | Blocked: 0 | Todo: 15

## Tasks
| ID    | Task                              | Owner      | Depends on | Status | Acceptance (evidence)          | Updated |
|-------|-----------------------------------|------------|------------|--------|--------------------------------|---------|
| T-001 | Scaffold Next.js 14 TS app + deps | Orchestrator | -        | DONE   | `npm run build` passes; package.json holds next@14, react, typescript, @worldcoin/idkit, @worldcoin/idkit-core, viem, @arkiv-network/sdk, vitest | 2026-11-06 |
| T-002 | Rabdi connectivity + sponsor funding | Backend B | T-001     | DONE | chain 7794095 block 282519, sponsor balance 10 tGLM (check-rabdi.mjs; key normalized with 0x prefix) | 2026-11-06 |
| T-003 | Registry lib TDD (UNIQUE nullifier/wallet) | Backend A | T-001 | DONE | `vitest run` green: tests/registry.test.ts covers duplicate-nullifier reject, duplicate-wallet reject, lowercase normalize, atomic check+insert | 2026-11-06 |
| T-004 | Shared TS contracts (lib/types.ts) | Orchestrator | T-001 | TODO | `npx tsc --noEmit` passes; types match PROMPT.md section 8 exactly | 2026-11-06 |
| T-005 | POST /api/rp-signature | Backend A | T-001 | TODO | curl with `{"action":"human-forum-register-v1"}` returns `{sig, nonce, created_at, expires_at}`; wrong action returns 400 bad-action | 2026-11-06 |
| T-006 | POST /api/verify-proof + binding | Backend A | T-003, T-005 | TODO | simulator signup x2: first 200 `{ok:true}`, second 409 worldid-reused; reused wallet 409 wallet-reused; files app/api/verify-proof/route.ts, lib/worldid/verify.ts | 2026-11-06 |
| T-007 | Arkiv schemas + server write path | Backend B | T-001, T-002 | TODO | `createEntity(Posts, 1d)` on Rabdi returns entityKey + expiresAt; tx hash visible on https://rabdi.explorer.arkiv.network/; files lib/arkiv/schemas.ts, lib/arkiv/client.ts | 2026-11-06 |
| T-008 | POST /api/posts + rate limit | Backend B | T-003, T-007 | TODO | bound-wallet curl returns entityKey; body over 5KB rejected; days outside {1,7,30} rejected; unbound wallet 403; files app/api/posts/route.ts, lib/arkiv/rateLimit.ts | 2026-11-06 |
| T-009 | GET /api/posts feed + cache | Backend B | T-008 | TODO | returns only ownedBy(sponsor) + live + author-in-registry, newest first, Live/Archived split via data/cache.json; spoof entity under same tag from unbound wallet is hidden | 2026-11-06 |
| T-010 | POST /api/comments (fixed 7d) | Backend B | T-007 | TODO | comment gets 7-day expiry; missing or expired parent rejected; no comment edit/extend routes exist; file app/api/comments/route.ts | 2026-11-06 |
| T-011 | Extend + edit post routes (owner-only) | Backend B | T-008 | TODO | owner extend bumps expiresAt from now; non-owner extend/edit 403; files app/api/posts/[key]/extend/route.ts, app/api/posts/[key]/edit/route.ts | 2026-11-06 |
| T-012 | Signup screen + IDKit widget | Frontend | T-004, T-005, T-006 | TODO | app/signup/page.tsx: orbLegacy signal=wallet flow, locks-forever warning, inline 409 errors, Design Read logged; no raw schema tags or nullifiers rendered | 2026-11-06 |
| T-013 | Feed screen | Frontend | T-004, T-009 | TODO | app/feed/page.tsx: title, shortened owner, lifetime badge, countdown, comment count, archived grey cards, unbound banner, loading/empty/error states | 2026-11-06 |
| T-014 | New-post + thread screens | Frontend | T-004, T-008, T-010, T-011 | TODO | app/post/new/page.tsx (title, body 5KB guard, 1/7/30d radio) and app/post/[key]/page.tsx (countdown, owner-only extend/edit, comments with 7-day-fixed notice) | 2026-11-06 |
| T-015 | Taste-skill gate + preflight | Frontend | T-012, T-013, T-014 | TODO | installed-skill checks (consistency.mjs, check.mjs, shoot.mjs, perf.mjs) pass on production build at required widths; preflight pasted in LOG.md; zero em-dashes; one icon lib | 2026-11-06 |
| T-016 | Security audit M1 (identity layer) | Security | T-006 | TODO | SECURITY.md findings for registry, rp-signature, verify-proof, secret handling; no open CRITICAL/HIGH or T-006 stays BLOCKED | 2026-11-06 |
| T-017 | Security audit M2 (content layer) | Security | T-011, T-014 | TODO | SECURITY.md findings for spoof filter, authz 403s, rate limit, validation, UI/.next leak scan; no open CRITICAL/HIGH | 2026-11-06 |
| T-018 | Final build + fresh-identity round trip | Orchestrator | T-015, T-016, T-017 | TODO | `vitest run` green, `npm run build` passes, round trip works (signup, post, comment, extend, 409 x2, 403, 429), Security final sign-off, README caveats written | 2026-11-06 |
| T-019 | Arkiv hackathon feedback docs (arkiv/*.md) | Orchestrator | - | DONE | four files exist under arkiv/; every technical claim cross-checked against PROMPT.md, AGENTS.md, LOG.md decisions; planned-vs-implemented clearly marked | 2026-11-06 |

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
