# How You Use Arkiv (how-you-use-arkiv.md)

Status note: the implementation is planned (TIMELINE.md T-007 through T-011), not yet
written. Paths, function names, and schemas below are the specified contracts from
PROMPT.md sections 4, 5, 8 and the LOG.md design decisions. Anything marked
"specified" does not exist in code yet.

## Entities

**Posts**, schema tag `human-forum.posts.v1` (specified, `lib/arkiv/schemas.ts`):
author `addr` indexed, postKey `str` indexed, title `str` (max 128 bytes UTF-8),
body `bytes` (app cap 5 KB, Arkiv cap 128 KiB). Editable and extendable by owner only.

**Comments**, schema tag `human-forum.comments.v1` (specified, same file): postKey
`str` indexed, author `addr` indexed, body `bytes`. Fixed 7-day expiry. No edit or
extend routes will exist.

Example post values at write time: author `addr("0xabc...")` (lowercased bound
wallet), postKey `"9f3c..."` (server-generated), title `"Meeting notes"`, body as
`stringToBytes(...)`.

## Writes

- Specified `lib/arkiv/client.ts` builds a public client and a wallet client on
  `rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY })` over `http()`, chain id
  7794095.
- Specified post creation: `walletClient.createEntity(Posts, values,
  { expiration: ExpirationTime.fromDays(days) })` with days in `{1, 3, 5}`. Returns
  `{ entityKey, expiresAt }`; the exact expiry block feeds the UI countdown.
- Specified comment creation: same call on `Comments` with `fromDays(7)`, rejected
  unless the parent post exists and is unexpired.
- Specified edit: `walletClient.patchEntity(Posts, entityKey, { set: {...} })`, never
  with the `readonly` flag. Specified extend: `walletClient.extendEntity({ entityKey,
  expiration: fromDays(n) })`, which counts from now. No `permissionlessExtension`
  flag anywhere.
- Specified failure mapping: `EntityMutationError` becomes a generic 403 or 404;
  raw messages never reach clients.

## Ownership and permissions

The sponsor wallet creates and retains ownership of every entity (LOG.md DECISION).
Only it can patch or extend, and only the server holds its key. User authority is
enforced one layer up: the API checks the caller's wallet against the registry
binding and the entity's server-set `author` column, returning 403 otherwise. The
`author` column is never taken from client input, and the feed never trusts it
without the `ownedBy(sponsor)` filter, because anyone can reuse our schema tag.

## Queries and filters

- Specified feed (`lib/arkiv/feed.ts`): `select({ $key, title, author, body,
  $expiresAt })`, `.from(Posts)`, `.ownedBy(sponsorAddress)`,
  `.where(gt("$expiresAt", u64(now)))`, newest first, `limit(100)` with keyset
  paging for cache syncs. Spoof entities (same tag, unbound owner) are excluded by
  `ownedBy`; expired rows are excluded by the chain itself.
- Specified comment counts: `client.count().from(Comments).where(eq("postKey",
  key)).fetch()`.
- Specified block clock: `publicClient.getBlockTiming()` converts `$expiresAt`
  blocks to countdown seconds at 2 s per block.

## Expiration rules and why they fit

| Entity | Lifetime | Why |
|---|---|---|
| Post | 1, 7, or 30 days, user-picked | Visibility is priced; short notices die cheap, essays persist. All within the 182.5-day max. |
| Comment | Fixed 7 days | Discussion outlives a 1-day post but never becomes permanent baggage; matches the "cannot edit" honesty rule. |

When an entity expires, queries stop returning it and mutations on it fail. The app
moves it to the Archived section from its own `data/cache.json` snapshot (there is
no expiry event to listen for), and comments under an expired post become
read-only history. Nothing is deleted; it becomes unqueryable.

## Feature map

| Arkiv feature | Implementation (specified) | Purpose | User-facing impact |
|---|---|---|---|
| `defineSchema` with indexed columns | `lib/arkiv/schemas.ts`, both schemas | Tag isolation, filterable author/postKey | Users only ever see this forum's posts; spoof rows never render. |
| `createEntity` + `ExpirationTime` | `POST /api/posts`, `POST /api/comments` | Paid, time-scoped publishing | Lifetime picker at publish; countdown on every card. |
| `ownedBy` trust filter | `lib/arkiv/feed.ts` | Exclude same-tag rows from strangers | Feed contains only registry-bound authors. |
| `$expiresAt` filter + write response | feed query, publish response | Live/Archived split, countdowns | Expired posts visibly archive; no silent persistence. |
| `patchEntity` (owner-only) | `POST /api/posts/[key]/edit` | Corrections without reposting | Edit button for authors; 403 for everyone else. |
| `extendEntity` (owner-only) | `POST /api/posts/[key]/extend` | Keep valuable posts alive | Extend button bumps the countdown from now. |
| `count()` | thread view | Comment counts without fetching bodies | Counts on feed cards stay cheap. |
| `getBlockTiming` | feed + thread | Block-to-second conversion | Countdowns read in minutes and days, not blocks. |

Deliberately unused in V1: `changeOwnership`, `deleteEntity`, batches, events,
`permissionlessExtension`, `readonly`. Each would change something users see, which
is exactly why none of them is claimed here.
