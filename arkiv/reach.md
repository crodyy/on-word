# Reach (reach.md)

## Who this is for

**Primary users:** members of small online communities (project groups, local clubs,
course cohorts, hackathon teams) who want a discussion board where every participant is
a verified human and nobody runs the database. They are not crypto users: they will
never hold tokens, sign transactions, or see an RPC URL. The signup screen says "locks
forever, cannot change"; the feed shows posts with lifetime countdowns. That is the
whole of Web3 they ever see.

**Secondary users:** developers in the World ID and Arkiv ecosystems looking for a
reference implementation of proof-of-human plus verifiable content in one small app.

## The specific problem

Open forums die to bots. CAPTCHAs arms-race, paid gates exclude, and moderator
allow-lists centralize trust in one admin's spreadsheet. Our answer is 1 verified
human = 1 locked wallet (World ID nullifier bound to an address, both UNIQUE in the
registry), and content that lives on Arkiv with a paid lifetime instead of on a
server we could silently edit. The lifetime picker (1/7/30 days) turns visibility into
a priced choice, and 5 posts/day per wallet caps sponsor drain.

## Why these users would actually use it

- Joining proves humanness once, then posting feels like any normal forum.
- Lifetimes are honest: a 1-day announcement really disappears from queries when it
  expires; a 30-day essay visibly counts down.
- Anyone can audit the content independently via the Rabdi explorer instead of taking
  our word for what was posted and when it expires.

## Can someone try it today?

Honestly: not yet. The project is specified (PROMPT.md, AGENTS.md) with a task board
(TIMELINE.md T-001 to T-018) but no implementation exists. The first runnable state
will be: local Next.js app, staging World ID simulator signup, posts and comments on
Rabdi, feed with allowlist filtering. There is no deployment, no demo video, no users,
no partnerships, and we claim none.

A first-time user at M8 will be able to: verify with the staging simulator, publish a
post with a chosen lifetime, comment under the 7-day fixed rule, extend a post,
watch an expired post move to Archived, and hit the real 409/403/429 guardrails.

## What remains incomplete

Everything in TIMELINE.md: scaffold, registry, both World ID routes, all Arkiv
routes, all four screens, both security audits, and the final round trip. Known V1
limitations are already declared in PROMPT.md section 2: comments are UI-frozen only
(an owner could still patch via raw RPC), expiry means disappearance from queries
rather than deletion, and key loss means permanent lockout.

## Post-Mumbai commitment

We will continue if the M8 round trip passes. Concrete next milestones, in order:

1. V2 usernames: opt-in handles mapped to bound wallets, kept in the registry, never
   in Arkiv entities.
2. Per-user entity ownership via `changeOwnership`, so extend/edit can move toward
   user-signed writes once account UX allows it.
3. Basic moderation: community flagging with transparent, on-chain resolutions.
4. Rabdi-to-mainnet migration path once content retention and cost are measured.

Why it matters: every step after M8 is about removing trust in our server without
reintroducing bots or burdening users with keys and gas. That is the whole thesis, and
it is bigger than one hackathon.
