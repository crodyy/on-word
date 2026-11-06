# Why Arkiv (why-arkiv.md)

## The replacement test

If we replaced Arkiv with PostgreSQL, what would users actually lose? Three things,
in descending order of importance for this product.

**1. Protocol-enforced lifetimes.** On Arkiv, a 1-day post stops being returned by
queries when its block passes, whether or not our server is running, honest, or even
exists. On Postgres, expiry is a cron job we operate: a bug, an outage, or a quiet
schema edit resurrects "expired" content. Our core promise, that visibility duration
is real, would downgrade from protocol guarantee to operator promise.

**2. Independent verifiability.** Anyone with the Rabdi RPC can re-run our feed query,
`ownedBy(sponsor)` plus `$expiresAt > now`, and check what we show against what the
chain returns, including exact expiry blocks from the write responses. On Postgres,
"the post expired at block N" is a row we wrote; users must trust us. For a forum
whose pitch is freedom from silent admin edits, that difference is the product.

**3. Tamper-evident history with no database to operate.** No migrations, no backups,
no replica lag, no admin panel that can rewrite a post. The tradeoff is real too:
100-row pages, no full-text search over `bytes` bodies, no joins, which is why the
feed is a simple recency list and search is out of V1 scope.

## What would recreating this on Postgres take?

To match the above you would need: Postgres plus a deletion scheduler with
monitoring, plus signed timestamps from an authority users trust instead of you,
plus a public audit log with hash-chained rows, plus read replicas you expose for
verification. That is a second system to build and a second trust story to tell.
Arkiv gives all of it as the default shape of a write.

## Honest limits of our Arkiv use

- In V1 the sponsor wallet owns every entity (see LOG.md entity-owner DECISION), so we
  do **not** use user-custodied ownership. A Postgres row with an `owner_address`
  column replicates our access pattern; what Postgres cannot replicate is the
  independent verifiability around it.
- Our feed is still our server's view. A malicious server could omit a live post from
  the JSON it serves. Arkiv does not fix that; it makes the omission detectable by
  anyone who queries directly. We claim detectability, not impossibility.
- We do not use events, batches, `changeOwnership`, or deletion in V1. Listing them
  as reasons would be dishonest; they are V2 material at most.

## What we deliberately keep OFF Arkiv, and why

| Data | Where | Why not Arkiv |
|---|---|---|
| Nullifier-to-wallet registry (`data/registry.json`) | Server file, gitignored | Privacy. Nullifiers and bindings must never be public; Arkiv is a public database. |
| `RP_SIGNING_KEY`, `ARKIV_ACCESS_KEY`, `SPONSOR_PRIVATE_KEY` | Server env only | Secrets. Never in entities, logs, responses, or client bundles (Security checklist). |
| Rate-limit counters (5 posts/day/wallet) | Server-side store | Churn. High-write counters would burn gas and need per-write transactions for data nobody needs to verify. |
| Feed cache (`data/cache.json`) | Server file | Derived data. Archived cards are our local snapshot of expired rows plus `$expiresAt` bookkeeping, cheaper to keep than to re-derive. |
| Sessions and auth state | Server | Ephemeral. No lifetime semantics, no audit value. |
| Title/body search index | None in V1 | `bytes` is unfilterable by design; search is out of scope rather than bolted on elsewhere. |

The rule: data goes on Arkiv when its value is being publicly verifiable with a
protocol-enforced lifetime. Everything private, secret, high-churn, or derived stays
off. Arkiv is load-bearing for exactly the properties Postgres cannot give us, and
absent everywhere else.
