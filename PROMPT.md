# PROMPT.md — Human-Only Decentralized Forum (World ID + Arkiv)

> Copy-paste this file into any coding agent as project context. Stack: Next.js 14 App Router + TypeScript + viem + @worldcoin/idkit + @arkiv-network/sdk. Chain: Arkiv Rabdi testnet (chain id 7794095, 2s blocks, tGLM gas).

## 1. One-liner

A human-only forum where 1 verified human = 1 username = 1 locked wallet, and posts/comments live on Arkiv (Web3 DB) with paid lifetimes. Web3 hidden behind a Web2-feel UI.

## 2. Theory (why this design)

- Sybil problem: open forums die to bots. Fix = Proof-of-Human via World ID (IDKit). Backend verifies ZK proof with Developer Portal, gets stable `nullifier` per human per `action`. Nullifier is the dedupe key — NOT a wallet signature (World ID never signs your wallet).
- Data problem: centralized DB can censor/edit silently. Fix = Arkiv entities: wallet-owned, tamper-evident (Merkle trie), time-scoped (`$expiresAt` block), queryable by indexed attributes. Only `$owner` can update/extend/transfer/delete. Writes = signed EVM txs paid in GLM/tGLM.
- Anti-spam economics: every post/comment costs gas + lifetime. Lifetime picker (1/7/30 days) = user pays for visibility duration. Rate limits (5 posts/day) stop sponsor drain.
- Trust model: server registry (username <-> nullifier <-> wallet, all UNIQUE) is the source of truth for identity; Arkiv is the source of truth for content. Never trust `author/username` attributes from Arkiv alone — anyone can reuse your schema tag, so feed filters by `ownedBy(allowlisted wallets)`.
- Known limitation (tell judges): comments are UI-frozen, not cryptographically frozen — Arkiv owners can always update via raw RPC. Expiration = disappears from queries, not "archived". Key loss = permanent lockout in V1.

## 3. Tech + keys

- Deps: `@worldcoin/idkit`, `@worldcoin/idkit-core/signing`, `viem`, `@arkiv-network/sdk`, `vitest`.
- Node >= 22.10. Env (`.env.local`, never commit):
  WORLD_APP_ID=app_... | WORLD_RP_ID=rp_... | RP_SIGNING_KEY=hex (server-only)
  WORLD_ACTION_REGISTER=human-forum-register-v1 (single fixed action for Sybil resistance)
  ARKIV_ACCESS_KEY=... | SPONSOR_PRIVATE_KEY=0x... (testnet burner) | REGISTRY_PATH=./data/registry.json
- Portals: Developer Portal (app_id/rp_id/signing key), Arkiv Hub (access key + tGLM faucet), simulator.worldcoin.org (staging tests, `environment: staging`).

## 4. Data model

Registry (`data/registry.json`, UNIQUE on each field, wallet lowercased, username `^[a-z0-9_]{5,24}$`):
  { username, nullifier, wallet, createdAt }

Arkiv schemas (tag must be unique to project):
  Posts `human-forum.posts.v1`: username str.indexed, author addr.indexed, postKey str.indexed, title str, body bytes. Editable + extendable by owner only.
  Comments `human-forum.comments.v1`: postKey str.indexed, username str.indexed, author addr.indexed, body bytes. Fixed 7-day expiry, no edit/extend UI.
Blocks: Rabdi 2s/block → 1 day = 43200 blocks. Use `ExpirationTime.fromDays(n)`.

## 5. Workflows (system)

WF-1 Signup/lock: client collects username+wallet → POST /api/rp-signature {action} → server `signRequest` → client IDKit request with `signal = username|wallet`, preset `orbLegacy({signal})` → World App scan (QR/deep-link) → proof → POST /api/verify-proof {idkitResponse, username, wallet} → server verifies at `POST https://developer.world.org/api/v4/verify/{rp_id}`, extracts `nullifier`, checks signal_hash match, `registerBinding` (409 on username-taken/worldid-reused/wallet-reused) → bound.

WF-2 Post: bound wallet only → pick lifetime (1/7/30d) → server checks rate limit → `walletClient.createEntity(Posts, {...}, {expiration})` → returns entityKey → feed shows with countdown.

WF-3 Comment: bound wallet only, parent post must exist + unexpired → fixed 7d `createEntity(Comments, ...)` → flat list under post. No edit/extend routes.

WF-4 Extend/edit post: owner wallet + registry match only → SDK extend/update → `$expiresAt` bumps. Non-owner → 403.

WF-5 Feed: `publicClient.select(...).from(Posts).fetch()` → keep only `$owner` in registry + `$expiresAt > now` → sort newest → split Live vs Archived (local cache `data/cache.json`).

## 6. Userflows (screens)

- /signup: enter username (live regex hint) → connect wallet (show "locks forever, cannot change") → [Verify I am human] → World App QR/modal → success "You're human ✓" → redirect /feed. Errors: username-taken / already-verified / wallet-used → inline message, no retry loophole.
- /feed: list posts (title, username, time-left, comment count) → lifetime badge → [New post] (bound users only).
- /post/new: title + body (≤5KB) + lifetime radio (1/7/30d, show approx cost) → [Publish] → wallet/sponsor confirm → toast entityKey → redirect thread.
- /post/[key]: post body + countdown + [Extend] + [Edit] (owner only) + flat comments + comment box (shows "7-day fixed, cannot edit").
- States: unbound visitor = read-only + "verify to participate" banner; expired post = "archived" grey card.

## 7. MVP scope

IN: signup lock, posts CRUD+extend, flat comments, feed with allowlist + countdown, rate limits, staging simulator pass, demo video + README caveats.
OUT: threading depth, likes/votes, moderation DAO, search, media upload, mainnet, mobile native, recovery, custom token.

## 8. API contracts

- POST /api/rp-signature {action} → {sig, nonce, created_at, expires_at} | 400 bad-action
- POST /api/verify-proof {idkitResponse, username, wallet} → {ok:true, nullifier} | 400 verify-failed | 409 username-taken|worldid-reused|wallet-reused
- POST /api/posts {title, body, days:1|7|30} (auth: bound wallet) → {entityKey} | 403/429
- GET /api/posts → {posts:[{key,title,username,owner,expiresAt}]} (allowlisted only)
- POST /api/posts/[key]/extend {days} → {expiresAt} | POST /api/posts/[key]/edit {title?,body?} → {ok} (owner only)
- POST /api/comments {postKey, body} → {entityKey} (fixed 7d, parent must be live)

## 9. Build order + acceptance

0. Scaffold + env + faucets funded. 1. Registry TDD (`vitest run` green) + rp-signature curl → 2. Simulator signup ×2 (second rejected 409) → 3. Post via curl, tx on Rabdi explorer → 4. Feed hides unbound-tag spoof → 5. Comment fixed-expiry, no edit buttons → 6. Extend bumps expiresAt, non-owner 403 → 7. 6th rapid post → 429 → 8. `npm run build` + full round-trip on fresh identity.
Rule: failing test first, minimal implement, re-run green, commit per task (`feat(scope): msg`).

## 10. Rules for agent

- Never generate RP signatures or expose RP_SIGNING_KEY / ARKIV_ACCESS_KEY / SPONSOR_PRIVATE_KEY client-side. Server routes only.
- Single WORLD_ACTION_REGISTER everywhere for identity. Lowercase wallets. Validate username server-side.
- Query Arkiv only through project schemas + ownedBy allowlist. Convert blocks↔days at 2s/block.
- Keep seamless-UX: hide RPC/gas details, but surface lifetime countdown + "locks forever" + "comments can't be edited" honestly.
- Docs authority: https://docs.world.org/world-id/idkit/integrate, verify API, https://docs.arkiv.network/start-here/first-entity/ + introduction/.
