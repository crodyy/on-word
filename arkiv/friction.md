# Arkiv Feedback (friction.md)

Honest scope note: at the time of writing, this project is specified but not yet
implemented (TIMELINE.md tasks T-001 through T-018 are TODO). Every issue below was
encountered during the design phase while reading the Arkiv docs and settling the
architecture, and each is substantiated by a doc page or a decision in LOG.md. Nothing
here is invented from implementation experience we do not have yet.

## F1. No documented pattern for backend-sponsored writes

**Problem.** Our users must never touch gas, RPC endpoints, or private keys. The design
specifies that all writes are signed server-side by a sponsor wallet, with the human's
identity carried in a server-set `author` column. The docs walk through one model only: the user's own wallet
signs every write.

**Expected behavior.** A guide for "your app writes on behalf of users," covering who
should own such entities and how readers should trust them.

**Actual behavior.** We derived our design from a single sentence on the filter page
("filter by your backend's account for data your app writes") plus the ownership rules
on the change page. The correct call, sponsor-retains-ownership, took real deliberation
(see LOG.md 2026-11-06 entity-owner DECISION).

**Reproduction steps.** Read writing/create, writing/change, and querying/filter looking
for the words "sponsor," "gasless," or "backend writes." They are not there.

**Proposed improvement.** A short "sponsored writes" recipe: sponsor creates and keeps
ownership, server sets an identity column, readers filter `ownedBy(backend)` and check
the column against their own allowlist, with the spoof test spelled out.

**Impact.** High. Every consumer app that wants a Web2-feel UX hits this in week one.

## F2. Multi-owner allowlist filtering is plausible but unvalidated

**Problem.** The natural feed design for user-owned entities is "entities owned by any of
K allowlisted wallets." `ownedBy()` takes one address. `$owner` is filterable, so
`or(eq("$owner", addr(a)), eq("$owner", addr(b)))` should work, but no example confirms
it, and query-size limits for large allowlists are undocumented.

**Expected behavior.** An example query matching any of several owners, with guidance on
limits and chunking.

**Actual behavior.** We designed around the gap instead: single-owner
`ownedBy(sponsor)` plus a registry check (LOG.md allowlist DECISION). That works for us,
but a project that needs per-user ownership still has no confirmed recipe.

**Reproduction steps.** Try to build the allowlist query from the filter page alone.
There is no multi-owner example to copy.

**Proposed improvement.** One docs example for "any of these owners," plus the max
`or()` width or a recommended per-wallet fan-out pattern.

**Impact.** Medium. Feed-over-allowlist is a core forum/social pattern.

## F3. Extend durations count from now, and that is easy to misread

**Problem.** `extendEntity({ expiration: fromDays(30) })` on an entity with 10 days left
yields 30 days total, not 40. An earlier expiry is rejected.

**Expected behavior.** We initially assumed extension stacks onto the remaining lifetime,
because that is what "extend" means in every subscription product.

**Actual behavior.** The expiration page documents the from-now semantics clearly, so we
caught it before coding. Credit where due: the page even calls out the exact 10+30=30
example.

**Reproduction steps.** Read writing/expiration with subscription mental models.

**Proposed improvement.** Nothing required in behavior. An SDK-side convenience such as
`extendBy(duration)` that reads the current `$expiresAt` and tops it up would remove the
footgun for apps that want stacking (our lifetime picker does not need it).

**Impact.** Low for us, medium for anyone building renewals.

## F4. Expired entities vanish silently; archiving is our job

**Problem.** Expired entities stop appearing in queries and Arkiv emits no expiry event.
Our "Archived" feed section therefore cannot come from Arkiv at all; we snapshot rows
into `data/cache.json` and retire them ourselves using `$expiresAt`.

**Expected behavior.** Some signal, a tombstone row, or an event stream we could tail to
learn that key X expired.

**Actual behavior.** `watchEntityEvents` covers entity activity, but the expiration page
states plainly that no event fires on expiry. Polling `$expiresAt` is the only path.

**Reproduction steps.** Create a 1-day entity, query it after expiry, observe absence
with no callback having fired.

**Proposed improvement.** Document the recommended archive pattern (snapshot selected
fields plus `$expiresAt`, sweep locally), since every app with an "expired" UI state
reinvents it. Longer term, an expiry event feed.

**Impact.** Medium. It shaped our architecture (local cache file, sweep logic).

## F5. `bytes` is never indexed and `str` caps at 128 bytes

**Problem.** Post bodies live in `bytes`, which cannot be filtered or sorted, and titles
live in `str`, capped at 128 bytes, not characters. A 40-character title with multibyte
text can exceed the cap while looking short.

**Expected behavior.** Search over post bodies and character-based title limits.

**Actual behavior.** Both limits are documented (column-types, limits pages), so this is
a design constraint rather than a surprise: no full-text search, title validated by
UTF-8 byte length, 5 KB body cap enforced by us (stricter than Arkiv's 128 KiB).

**Reproduction steps.** Define the posts schema per PROMPT.md section 4 and attempt a
`where()` on `body` (compile error) or store a long multibyte title.

**Proposed improvement.** A docs note with a byte-length validator snippet for `str`
columns, and a statement of the recommended off-chain search pattern (we keep search
out of scope in V1).

**Impact.** Low for us (feed browses by recency, comment counts via `count()`), higher
for search-heavy apps.

## F6. Public RPC is rate-limited; keys are mandatory even for reads

**Problem.** Our feed is read-heavy. The public RPC is heavily rate-limited "to prevent
abuse," so a free access key from Arkiv Hub is required before the first query works
reliably.

**Expected behavior.** Anonymous reads up to a modest quota with clear headers when the
limit bites.

**Actual behavior.** Key-first flow, with a console warning when the key is missing. It
works, but every deploy needs key provisioning, and key-less local development will
flap under load.

**Reproduction steps.** Run the first-entity tutorial without `ARKIV_ACCESS_KEY` in a
loop.

**Proposed improvement.** Publish the public-RPC quota numbers and return a distinct,
catchable error for "rate limited, get a key" so apps can surface it instead of
retrying blindly.

**Impact.** Medium for onboarding and demos.

## F7. No local emulator; everything integrates against Rabdi

**Problem.** There is no local devnet or emulator. Every test, including the registry
TDD loop, touches Rabdi, needs tGLM from the faucet, and depends on 2-second blocks.

**Expected behavior.** A local node or mock client for unit-speed red/green TDD.

**Actual behavior.** Our plan splits accordingly: registry logic is unit-tested locally
(T-003), Arkiv paths are integration-tested against Rabdi (T-007). That is workable but
slower than a local emulator.

**Reproduction steps.** Try to run `createEntity` without network access.

**Proposed improvement.** A lightweight local emulator or an official in-memory mock of
the wallet/public clients for CI.

**Impact.** Medium. It slows every contributor's inner loop.

## What worked well

- `defineSchema` with typed columns caught our `body`-filter mistake at compile time
  instead of at runtime.
- `ExpirationTime.fromDays` plus the exact `expiresAt` in the write response gives the
  feed countdown a trustworthy source.
- `query.toString()` makes logged queries auditable; we plan to log them in development.
- The first-entity tutorial is genuinely runnable end to end.
- Ownership semantics (only `$owner` patches/extends; creator never changes) are crisp
  and made the sponsor-ownership decision easy to reason about once found.
