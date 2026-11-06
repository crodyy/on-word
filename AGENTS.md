# AGENTS.md — Multi-Agent Operating Manual
## Human-Only Decentralized Forum (World ID + Arkiv)

> Read `PROMPT.md` first. It is the project spec and the source of truth for the stack, data model, API contracts, workflows and build order. This file defines **who does what** and **how the agents stay in sync**.
>
> **Docs are binding (section 7).** Arkiv code follows https://docs.arkiv.network/ and World ID code follows https://docs.world.org/world-id/idkit/integrate exactly. **Frontend work follows the taste skill `design-taste-frontend` (section 8).** Where `PROMPT.md` and the docs disagree, the docs win and the Orchestrator logs a `CONTRACT_CHANGE`.

---

## 0. FIRST ACTION (MANDATORY)

### 0.A Skills setup (runs before anything else)

Before reading tasks or writing any file, the Orchestrator installs and verifies the skills below. If a skill is missing, no agent proceeds. Log the result as `DECISION` in `LOG.md` (skills installed, versions, and any that failed).

**1. Superpowers** (https://github.com/obra/superpowers). The development methodology for every agent. This project runs on **Hermes Agent**:
- Install: `hermes plugins install obra/superpowers --enable`
- Restart any active Hermes sessions after installing.
- Verify: in a fresh session, `Let's make a react todo list` should auto-trigger `brainstorming` before any code.
- Hermes has no post-compaction hook. If a long session compacts, the Superpowers bootstrap is lost and skills stop triggering. When that happens, log it in `LOG.md` and start a fresh session. Keep tasks short (2 to 5 minutes, one task per fresh agent) so sessions rarely compact.
- If a subagent session does not show Superpowers active, install it for that session before it takes a task.

**2. Taste Skill** (https://www.tasteskill.dev/docs). Only the Frontend agent uses it, but the Orchestrator installs it.
- `npx skills add Leonxlnx/taste-skill` (installs `design-taste-frontend`). The Taste Skill docs do not list Hermes by name, so after installing, confirm Hermes can load `design-taste-frontend`. If it cannot, clone https://github.com/Leonxlnx/taste-skill and place the `design-taste-frontend` folder where Hermes reads skills, then log the path used.
- Requires Node 22+ and Chrome, Edge or Chromium for the inspector. Network is needed for finding pictures.

**How Superpowers maps onto this manual (all agents):**
- `brainstorming` and `writing-plans` feed the Orchestrator's task assignment. The plan becomes `TIMELINE.md` tasks of 2 to 5 minutes of work each, with exact file paths and verification steps.
- `test-driven-development` is mandatory for every backend task (red, watch it fail, minimal code, green, commit). Code written before its test is deleted.
- `subagent-driven-development` is how the Orchestrator dispatches work: one fresh agent per task, with review after each. `dispatching-parallel-agents` is used only for tasks with disjoint file ownership (section 1).
- `requesting-code-review` runs between tasks. Critical issues block progress, matching the Security gate.
- `systematic-debugging` and `verification-before-completion` apply before any task is marked `IN_REVIEW` or `DONE`.
- `using-git-worktrees` and `finishing-a-development-branch` apply to the repo workflow. One commit per task still holds.
- Superpowers does not override sections 1 to 8. Ownership, contracts, docs rules and the Security gate win on any conflict.
- Optional: set `SUPERPOWERS_DISABLE_TELEMETRY=1` to turn off the visual companion logo ping.

### 0.B Task Assignment phase

**Before any code is written, and after 0.A passes, the Orchestrator (Agent 1) must run the Task Assignment phase:**

1. Read `PROMPT.md` fully.
2. Create `LOG.md` and `TIMELINE.md` (templates in section 5).
3. Break the build order (PROMPT.md §9, steps 0–8) into concrete tasks. Give each task an ID (`T-001`, `T-002`, ...), an owner agent, dependencies, and acceptance criteria.
4. Write all tasks into `TIMELINE.md` with status `TODO`.
5. Publish the assignment (log it in `LOG.md`) and only then release the first unblocked tasks to the other agents.

No agent starts work until its task appears in `TIMELINE.md` with its name on it. If an agent has no assigned task, it waits.

---

## 1. Agent roster

| # | Agent | Owns | Must not touch |
|---|-------|------|----------------|
| 1 | **Orchestrator** | `TIMELINE.md`, `LOG.md`, task assignment, integration checks, final build | Feature code (except trivial integration glue) |
| 2 | **Frontend** | `app/**` pages and components, UI state, styling, IDKit client widget | `app/api/**`, `lib/arkiv/**`, `lib/worldid/**`, any secret |
| 3 | **Backend A: World ID** | `app/api/rp-signature`, `app/api/verify-proof`, `lib/worldid/**`, `lib/registry/**`, registry tests | Arkiv code, UI |
| 4 | **Backend B: Arkiv** | `app/api/posts/**`, `app/api/comments`, `lib/arkiv/**`, rate limit, feed cache, Arkiv tests | World ID code, UI |
| 5 | **Security** | Review and audit of everything. Can block merges. Writes only `SECURITY.md` and security tests | Feature code (reports issues and the owner fixes them) |

Note: your brief asked for "4 agents" but described five roles (frontend, two backend, security, orchestrator). This manual defines all five.

---

## 2. Agent 1 — Orchestrator (project manager and integrator)

**Mission:** Keep every agent in sync so the end product works as one system.

**Responsibilities**
- Run the Task Assignment phase first (section 0).
- Maintain `TIMELINE.md` as the live board: every task is `TODO`, `IN_PROGRESS`, `BLOCKED`, `IN_REVIEW`, or `DONE`.
- Append every meaningful event to `LOG.md` (assignment, start, finish, blocker, decision, handoff, failed check).
- Own the **shared contracts**: API shapes (PROMPT.md §8), the registry shape, the Arkiv schema tags, and the shared TypeScript types in `lib/types.ts`. Any contract change goes through the Orchestrator and gets logged, and affected agents are notified in `LOG.md`.
- Prevent collisions: assign **disjoint file ownership**. If two agents need the same file, split it or sequence the tasks.
- Run integration checks after each milestone: `vitest run`, `npm run build`, and the matching acceptance step from PROMPT.md §9.
- Reject work that breaks another agent's area, and send it back with a reason in `LOG.md`.
- Require a Security sign-off before a task that touches secrets, identity, ownership, or Arkiv queries is marked `DONE`.
- Hold the final end-to-end round-trip on a fresh identity (§9 step 8).

**Rules**
- Never mark a task `DONE` without evidence (test output, curl response, tx hash, or build output) recorded in `LOG.md`.
- Never let an agent work around a contract mismatch silently. Fix the contract or the code, then log it.
- Keep one commit per task: `feat(scope): msg`.
- Enforce the push approval gate (section 4, rule 10). Never release the next dependent task until the push for the previous one is approved or the user says to continue without it.

---

## 3. Agents 2–5 — scope and rules

### Agent 2 — Frontend
**Builds:** `/signup`, `/feed`, `/post/new`, `/post/[key]` and shared components (PROMPT.md §6).

- Use IDKit with `orbLegacy({signal})`, `signal = username|wallet`. The RP signature comes only from `POST /api/rp-signature`.
- Show lifetime countdown, the "locks forever, cannot change" warning, and "7-day fixed, cannot edit" for comments.
- Unbound visitor: read-only plus a "verify to participate" banner. Expired post: grey "archived" card.
- Inline errors for `username-taken`, `worldid-reused`, `wallet-reused`, `429`, with no retry loophole.
- Hide RPC and gas details from the user. Never hide lifetime or permanence facts.
- Show **only** the fields the API returns. Never render raw schema tags, access keys, nullifiers, or other users' registry data.
- Consume APIs strictly per PROMPT.md §8. If a response shape is missing something, ask the Orchestrator and do not guess.

### Agent 3 — Backend A: World ID
**Builds:** registry, RP signing, proof verification.

- Registry: UNIQUE on `username`, `nullifier`, `wallet`. Wallet is lowercased. Username matches `^[a-z0-9_]{5,24}$`, validated server-side.
- `POST /api/rp-signature`: accepts only `WORLD_ACTION_REGISTER`, otherwise `400 bad-action`. Uses `signRequest` with `RP_SIGNING_KEY`.
- `POST /api/verify-proof`: calls `https://developer.world.org/api/v4/verify/{rp_id}`, extracts `nullifier`, checks the signal hash against `username|wallet`, then `registerBinding`. Returns `409` with `username-taken`, `worldid-reused`, or `wallet-reused`, and `400 verify-failed`.
- Never return the nullifier to anyone but the verifying caller, and never log it in plain text.
- Export a `getBinding(wallet)` and `getAllowlist()` helper for Agent 4 to consume (agreed with the Orchestrator).
- **TDD:** failing test, minimal implementation, green test, commit.
- Support `environment: staging` for the simulator.

### Agent 4 — Backend B: Arkiv
**Builds:** Arkiv client, Posts and Comments entities, feed, rate limit.

- Schemas: `human-forum.posts.v1` and `human-forum.comments.v1` exactly as in PROMPT.md §4.
- Writes go through the sponsor wallet or the bound wallet via the SDK `createEntity` with `ExpirationTime.fromDays(n)`. Only `days` in `{1, 7, 30}` is accepted for posts. Comments are fixed at 7 days.
- Auth for writes: the caller must be a bound wallet in the registry. Extend and edit require `$owner` to equal the caller's wallet and a registry match, otherwise `403`.
- Comments: the parent post must exist and be unexpired. Do **not** create comment edit or extend routes.
- Feed: query only through the project schemas and filter by `ownedBy(allowlist)` plus `$expiresAt > now`. Sort newest first and split Live and Archived (cache in `data/cache.json`). Never trust `author` or `username` attributes from Arkiv alone. Resolve usernames from the registry.
- Rate limit: 5 posts per day per bound wallet, returning `429`.
- Body size: reject posts over 5KB. Convert blocks and days at 2s per block.
- Depends on Agent 3's registry helpers. Do not re-implement them.

### Agent 5 — Security
**Mission:** Audit continuously and block unsafe work. It doesn't ship features.

**Checklist (run on every milestone and before the final build)**
1. **Secrets:** `RP_SIGNING_KEY`, `ARKIV_ACCESS_KEY`, `SPONSOR_PRIVATE_KEY` appear only in server code. None appear in client bundles, `NEXT_PUBLIC_*`, responses, logs, or the repo. `.env.local` and `data/` are in `.gitignore`. Grep the built `.next/static` output for secret values and key names.
2. **Schema tag and Arkiv internals:** `human-forum.posts.v1`, `human-forum.comments.v1`, the access key, RPC URLs with keys, and raw attribute names are not displayed in the UI or leaked in API responses beyond the agreed contract.
3. **User info exposure:** nullifiers are never sent to other users or rendered. Registry data is never fully dumped. API responses expose only what PROMPT.md §8 defines. Wallets are shown only where the contract says so (`owner`).
4. **Spoofing:** the feed filters by `ownedBy(allowlist)`. Test with a post under the same schema tag from an unbound wallet and confirm it is hidden. Usernames come from the registry, not from entity attributes.
5. **AuthZ:** extend and edit return 403 for non-owners. Comments cannot be edited or extended through any route. Writes from unbound wallets are rejected.
6. **Input validation:** server-side username regex, `days` allowlist, body size limit, JSON shape validation, and wallet address format.
7. **World ID integrity:** a single `WORLD_ACTION_REGISTER`, signal hash verified, no client-side RP signing, and no replay path that skips the 409 checks.
8. **Abuse:** rate limit is enforced server-side and not bypassable by switching headers or clients.
9. **Errors:** error messages are generic enough not to leak stack traces, file paths, or env values.

**Output:** findings go to `SECURITY.md` and `LOG.md` with severity (`CRITICAL`, `HIGH`, `MED`, `LOW`), the owner agent, and a fix status. A `CRITICAL` or `HIGH` finding sets the related task to `BLOCKED` until fixed and re-verified.

---

## 4. Workflow rules (all agents)

1. **Assignment first.** Work only on tasks assigned in `TIMELINE.md`.
2. **Stay in your lane.** Edit only files you own. For anything else, send a request via `LOG.md` to the Orchestrator.
3. **Contracts are law.** Follow PROMPT.md §8 exactly. Changes go through the Orchestrator.
4. **TDD where applicable.** Failing test, minimal implementation, green run, commit.
5. **Update status in real time.** Set the task to `IN_PROGRESS` when you start and `IN_REVIEW` when finished, and add a `LOG.md` entry with evidence.
6. **Review gate.** `IN_REVIEW` → Security checks (when relevant) → Orchestrator integration check → `DONE`.
7. **One commit per task:** `feat(scope): msg`.
8. **Don't invent.** If docs or the spec are unclear, log a question, check the docs listed in PROMPT.md §10, and don't guess.
9. **Never commit secrets.**
10. **Push approval gate.** After every task or sub-task is completed (and committed), the agent **stops and asks the user for approval to `git push`**. It states the task ID, the commit message, the files changed and the evidence (test or build output), then waits. No agent pushes without an explicit "yes" from the user for that task. Approval for one task does not carry over to the next. If the user declines or asks for changes, the agent fixes the work, makes a new commit, and asks again. The Orchestrator logs each request and the answer in `LOG.md` as a `DECISION` (`push approved` or `push declined`). Never force-push, and never push to `main` unless the user says so.

### Suggested execution order
```
Orchestrator: assign tasks (FIRST)
  → Step 0  Scaffold, env, faucets                     (Orchestrator + Backend B)
  → Step 1  Registry TDD + rp-signature curl           (Backend A)   → Security review
  → Step 2  Simulator signup x2, second gets 409       (Backend A + Frontend)
  → Step 3  Post via curl, tx on Rabdi explorer        (Backend B)
  → Step 4  Feed hides unbound-tag spoof               (Backend B)   → Security review
  → Step 5  Comments, fixed expiry, no edit UI         (Backend B + Frontend)
  → Step 6  Extend bumps expiresAt, non-owner 403      (Backend B)   → Security review
  → Step 7  6th rapid post gets 429                    (Backend B)
  → Step 8  Final build + fresh-identity round trip    (Orchestrator + Security final audit)
```
Frontend work on each screen runs in parallel once the matching API contract is stubbed by the Orchestrator.

---

## 5. Tracking files (required in the repo root)

### `TIMELINE.md` — the task board
Updated by the Orchestrator (other agents request status changes through their `LOG.md` entries, or update their own task rows when the Orchestrator allows it).

```md
# TIMELINE

Last updated: <date/time>

## Summary
Done: 0 | In progress: 0 | In review: 0 | Blocked: 0 | Todo: N

## Tasks
| ID    | Task                              | Owner      | Depends on | Status | Acceptance (evidence)          | Updated |
|-------|-----------------------------------|------------|------------|--------|--------------------------------|---------|
| T-001 | Scaffold Next.js, env, deps       | Orchestrator | -        | TODO   | `npm run build` passes         |         |
| T-002 | Registry with UNIQUE constraints  | Backend A  | T-001      | TODO   | `vitest run` green             |         |
| ...   |                                   |            |            |        |                                |         |

## Milestones
- [ ] M1 Registry + RP signature
- [ ] M2 Signup lock working (409 on duplicates)
- [ ] M3 Posts on Arkiv
- [ ] M4 Feed allowlist
- [ ] M5 Comments
- [ ] M6 Extend/edit + authz
- [ ] M7 Rate limit
- [ ] M8 Final build + round trip + security sign-off
```

### `LOG.md` — append-only event log
Newest entries at the bottom. Never delete or rewrite entries. Corrections are new entries.

```md
# LOG

## <YYYY-MM-DD HH:MM> | <Agent> | <T-ID> | <EVENT>
EVENT = ASSIGNED | STARTED | DONE | BLOCKED | DECISION | CONTRACT_CHANGE | HANDOFF | SECURITY_FINDING | CHECK_FAILED | QUESTION
- What: <one or two lines>
- Evidence: <test output, curl result, tx hash, build result>
- Next / needs: <who needs to do what>
```

### `SECURITY.md` — written by Agent 5
A findings table: `ID | Severity | Area | Description | Owner | Status | Verified by`.

---

## 6. Definition of Done (project)

(See sections 7 and 8 for the docs and design rules that also apply.)

- All tasks in `TIMELINE.md` are `DONE` with evidence in `LOG.md`.
- `vitest run` is green and `npm run build` succeeds.
- Security Agent has completed its checklist with no open `CRITICAL` or `HIGH` findings.
- The full round trip on a fresh identity works: signup, post, comment, extend, 409 on duplicate, 403 for non-owner, 429 on the 6th post.
- README lists the known limitations (PROMPT.md §2): comments are UI-frozen only, expiration means disappearance from queries, and key loss means permanent lockout in V1.

---

## 7. Binding documentation rules

These pages are the source of truth for SDK usage. Open the page before writing the code. Do not code from memory. If `PROMPT.md` and the docs disagree, the docs win, and the Orchestrator logs a `CONTRACT_CHANGE`.

### 7.A Arkiv (Backend B writes, Security verifies)
Docs: https://docs.arkiv.network/ (full index: https://docs.arkiv.network/llms.txt). Start with https://docs.arkiv.network/start-here/first-entity/.

- Packages: `@arkiv-network/sdk` and `viem`. Node 22.10+. Chain `rabdi` from `@arkiv-network/sdk/chains`, built with `rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY })`. Use `createPublicClient` for reads and `createWalletClient` for writes.
- Schemas use `defineSchema("human-forum.posts.v1", {...})` and `defineSchema("human-forum.comments.v1", {...})` with `str`, `addr`, `bytes` from `@arkiv-network/sdk/schema`. Wrap `addr(...)` values. Read column values through `.value`.
- Limits: `str` max 128 bytes (so the post title is max 128 bytes UTF-8), `bytes` max 128 KiB (the 5KB post cap is enforced by us, stricter). Only indexed columns can be filtered on, and `bytes` is never indexed.
- Create: `walletClient.createEntity(schema, values, { expiration: ExpirationTime.fromDays(n) })`. It returns `{ entityKey, expiresAt }`. `expiration` is required.
- Max lifetime is about 182.5 days. Our 1/7/30 day options are within it.
- Extend: `walletClient.extendEntity({ entityKey, expiration })`. A duration counts **from now**, not from the current expiry (10 days left + `fromDays(30)` = 30 days, not 40). An earlier expiry is rejected. Do **not** set the `permissionlessExtension` flag on any entity.
- Edit: there is no `updateEntity`. Use `patchEntity(schema, entityKey, { set: {...} })`. Do **not** set the `readonly` flag on posts.
- Comments are never patched or extended by our code. Do not create those routes.
- Read: `publicClient.select({...}).from(Schema).ownedBy(...)`. Anyone can write entities with our schema tag, so `ownedBy` is the trust filter. Usernames always come from the registry.
- Expired entities are **not returned by queries**, and Arkiv emits no expiry event. So "Archived" cards can only come from our local cache (`data/cache.json`), and we drop entries ourselves using `$expiresAt`.
- Pages hold at most 100 rows. Paginate with the documented `limit` / `next` / cursor API. Comment counts use `client.count().from(Comments).where(...)`.
- Failures: catch `EntityMutationError` and map it to generic `403` or `404` responses. Never forward raw messages.

**Open questions for the Orchestrator to settle in the Task Assignment phase and log as `DECISION`:**
1. **Entity owner.** Only the `$owner` can extend or patch, and the feed trusts `ownedBy`. If the sponsor wallet signs `createEntity`, the owner is the sponsor, not the user. Either the user's bound wallet signs the write, or the sponsor creates and then calls `changeOwnership` to the bound wallet. Pick one, then implement and test it.
2. **Allowlist query.** Confirm in https://docs.arkiv.network/querying/filter/ and the query language reference how to match many owners (for example `or(...)` over `$owner`), or fall back to a per-wallet query. Do not guess.
3. **Rabdi explorer and faucet URLs.** Take them from https://docs.arkiv.network/ (Block Explorer and Get Test Tokens links).

### 7.B World ID / IDKit (Backend A and Frontend)
Docs: https://docs.world.org/world-id/idkit/integrate (index: https://docs.world.org/llms.txt). Also: RP Signatures https://docs.world.org/world-id/idkit/signatures.md, Verify API https://docs.world.org/api-reference/developer-portal/verify.md, Error Codes https://docs.world.org/world-id/idkit/error-codes.md.

- Packages: `@worldcoin/idkit` (React widget, Frontend) and `@worldcoin/idkit-core` (server signing from `@worldcoin/idkit-core/signing`). Use the latest `4.x`.
- Env values from the Developer Portal: `app_id`, `rp_id`, `signing_key` (secret).
- **RP signature (server only):** `signRequest({ signingKeyHex: process.env.RP_SIGNING_KEY!, action })` returns `{ sig, nonce, createdAt, expiresAt }`. The route responds with `{ sig, nonce, created_at, expires_at }` (snake_case, as the docs show). Never sign on the client.
- **Client:** `IDKitRequestWidget` with `app_id`, `action`, `rp_context` (`rp_id`, `nonce`, `created_at`, `expires_at`, `signature`), `allow_legacy_proofs={true}`, `preset={orbLegacy({ signal })}` where `signal = username|wallet`. Use `environment="staging"` only for the simulator. Run the backend check in `handleVerify` and throw when it fails. Do UI updates in `onSuccess`.
- **Verify (server):** forward the IDKit result **as-is** (no remapping) to `POST https://developer.world.org/api/v4/verify/{rp_id}`. Use `rp_id` from server env (`WORLD_RP_ID`), never from the client. Reject any `idkitResponse.environment` that differs from the backend's expected environment before calling the API, and require the verify response to have `success === true` and a matching `environment`. Return `400 verify-failed` otherwise.
- **Signal check:** compare the signal hash in the response with the hash of `username|wallet`. The docs state the backend must enforce the same signal value. Confirm the exact hashing in the docs before implementing, and add a test with a tampered signal.
- **Nullifier:** comes from `responses[].nullifier` as a 0x hex string for a 256-bit integer. Normalize it (convert to a number or canonical lowercase form) before the UNIQUE check, because casing differences can create a bypass. Scope uniqueness by `action`.
- Never log the nullifier or the proof.

---

## 8. Frontend design: the taste skill (Frontend agent, Security checks output)

The Frontend agent **must load the `design-taste-frontend` skill before writing any UI** and follow it explicitly. The Orchestrator does not accept UI tasks that skip it.

**Install and docs.** Taste Skill v2.1.x docs: https://www.tasteskill.dev/docs. Installed in section 0.A. Working files go to `.taste-skill/` in the project (add it to `.gitignore`, along with `assets/credits.json` handling below).

**Run order (from the docs).** Inventory, Draw, The idea, Build, Gate, Look and fix. In this project:
- **Inventory:** list 8 to 12 things only this forum has (human-only rule, lifetimes, locked identity, the 1/7/30 day choice). Use real project facts, never invented numbers.
- **Draw:** `node <skill>/scripts/draw.mjs` deals directions for the signup and landing surfaces. Use `draw.mjs --app` for feed, thread and composer screens (the docs treat these as app screens). Log the direction, seed and any redraw reason in `LOG.md`.
- **Gate:** run `lint.mjs src` and `inspect.mjs` at 1440, 768 and 390 pixels on the **production build** (`npm run build` then start), never the dev server. Use `inspect.mjs --app` for app screens. Every `FAIL` is fixed before `IN_REVIEW`. Every kept `WARN` needs a stated reason in `LOG.md`.
- **Look and fix:** at most three rounds of screenshot critique.
- **Pictures:** `assets.mjs` downloads open-licence images and records credits in `assets/credits.json`. Nothing is hotlinked. Credits go in the footer or a credits page. Found pictures show the world around the forum and are never presented as users' content.
- If Chrome or Node 22 is missing, run `lint.mjs` (Node 18 is enough), critique manual screenshots, and say in `LOG.md` that the inspector could not run.

**Scope note.** The skill's older text says it is not for dense dashboards, but v2.1 added an app-screen route. This forum is a content app, so apply it like this:
- Marketing-style surfaces (the signup screen, the empty feed hero, and any landing view) get the full skill.
- Feed, thread and composer screens use the skill's typography, color, motion, state and accessibility rules, at low density.

**Required first step.** Before UI code, the Frontend agent logs a one-line **Design Read** (skill section 0.B) and its three dial values in `LOG.md`, plus the Inventory list. If the installed skill version no longer uses dials, log the direction it dealt instead. Suggested starting point, to be adjusted from the brief: calm, trust-first, human-only community, `DESIGN_VARIANCE` 5, `MOTION_INTENSITY` 4, `VISUAL_DENSITY` 4. If the brief is ambiguous, ask the user **one** question.

**Project rules taken from the skill (all mandatory):**
- Stack: Next.js App Router, Server Components by default, Tailwind v4, `motion/react` for animation (isolated `'use client'` leaves), fonts via `next/font`. Check `package.json` before importing any library and print the install command if it is missing.
- Icons from one library only (Phosphor first). No hand-rolled SVG icons. No emoji in the UI.
- Fonts: not Inter by default and not a serif by default. Pick a distinctive sans (for example Geist, Outfit or Satoshi).
- Color: one accent, used the same everywhere. No AI-purple glow. No pure `#000` or `#fff`. Light and dark modes both designed and tested.
- One corner-radius system and one theme for the whole app (Shape Consistency Lock and Page Theme Lock).
- **Zero em-dashes or en-dashes in any visible string.** Use a hyphen, a period or a comma. This covers errors, toasts, buttons and alt text.
- Every screen has loading (skeleton), empty and error states. Forms put the label above the input and the error below it. No placeholder-as-label. Inputs and helper text pass WCAG AA.
- Buttons: label fits on one line, text contrast passes AA, tactile `:active` feedback. One label per intent (for example only one "Verify" wording).
- Motion must be motivated (feedback, state change, hierarchy), uses only `transform` and `opacity`, and honors `prefers-reduced-motion`. No `window` scroll listeners. Use `min-h-[100dvh]`, never `h-screen`.
- No decorative status dots, no fake-precise numbers, no placeholder names like "John Doe" in seed or demo data. Run the skill's Section 14 Pre-Flight Check before moving any UI task to `IN_REVIEW`, and paste the result in `LOG.md`.

**Honesty rules that outrank style (from the spec):** never hide the lifetime countdown, the "locks forever, cannot change" warning, or "7-day fixed, cannot edit" for comments. The UI shows only fields the API returns, so the design cannot invent data such as raw schema tags, nullifiers or other users' wallets.

**Version note.** The rules above come from the installed skill text and its docs. Where the newer v2.1.x docs add stricter checks (no eyebrow labels, no resting shadows, no gradients, no icon cards, at most two typefaces, at least eight moving elements on pages, four real pictures), the stricter rule applies to marketing surfaces. Anything the installed skill says that conflicts with the Honesty rules above loses.

**Security cross-check:** Agent 5 reads the rendered UI and the built `.next/static` output for schema tags, key names and nullifiers, and blocks the task if any appear.
