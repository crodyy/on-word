import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { desc } from "@arkiv-network/sdk/query";
import type { Hex } from "viem";
import { publicClient } from "./client";
import { Comments, Posts } from "./schemas";
import { KV_FEED_CACHE, resolveKv } from "../store/kv";

export const BLOCK_SECONDS = 2;
export const PAGE_LIMIT = 100;

export interface ChainPost {
  key: string;
  owner: string;
  author: string;
  postKey: string;
  title: string;
  body: string;
  expiresAtBlock: bigint;
}

export interface FeedPost {
  key: string;
  title: string;
  excerpt: string;
  owner: string;
  expiresAt: string;
  commentCount: number;
  expired: boolean;
}

export interface ThreadPostDetail {
  key: string;
  title: string;
  body: string;
  owner: string;
  expiresAt: string;
  expired: boolean;
}

// Decode a bytes-column cell (0x hex string, plain string, or byte array)
// back to text. Pure so it can be unit-tested.
export function decodeBodyCell(raw: unknown): string {
  const v = raw !== null && typeof raw === "object" && "value" in raw
    ? (raw as { value: unknown }).value
    : raw;
  if (typeof v === "string") {
    if (!v.startsWith("0x")) return v;
    return new TextDecoder().decode(Uint8Array.from(Buffer.from(v.slice(2), "hex")));
  }
  return new TextDecoder().decode(v as Uint8Array);
}

export const EXCERPT_CHARS = 180;

// Short preview of the body for the feed. Plain truncation with an
// ellipsis marker; the full body stays on the thread view.
export function makeExcerpt(text: string, max: number = EXCERPT_CHARS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max).trimEnd() + "...";
}

export interface FeedCache {
  version: 3;
  posts: {
    key: string;
    title: string;
    excerpt: string;
    owner: string;
    postKey: string;
    expiresAtBlock: string;
  }[];
}

export function emptyCache(): FeedCache {
  return { version: 3, posts: [] };
}

export async function loadCache(path: string): Promise<FeedCache> {
  // KV backend when configured: one shared key across serverless instances.
  // The path is the file location and is ignored for KV.
  const kv = resolveKv();
  if (kv) {
    const raw = await kv.get(KV_FEED_CACHE).catch(() => null);
    if (!raw) return emptyCache();
    try {
      const parsed = JSON.parse(raw) as FeedCache;
      if (!parsed || parsed.version !== 3 || !Array.isArray(parsed.posts)) return emptyCache();
      return parsed;
    } catch {
      return emptyCache();
    }
  }
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as FeedCache;
    // Version 2 cached rows without excerpts. Drop stale caches rather
    // than show posts with missing previews.
    if (!parsed || parsed.version !== 3 || !Array.isArray(parsed.posts)) return emptyCache();
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyCache();
    throw err;
  }
}

// Feed cache TTL: comfortably outlives the longest post lifetime (5 days)
// plus archived viewing; rows carry their own expiry blocks regardless.
const FEED_CACHE_TTL_S = 30 * 24 * 3600;

export async function saveCache(path: string, cache: FeedCache): Promise<void> {
  const kv = resolveKv();
  if (kv) {
    await kv.set(KV_FEED_CACHE, JSON.stringify(cache), { ex: FEED_CACHE_TTL_S });
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(cache, null, 2), "utf8");
  await rename(tmp, path);
}

// Pure split: live = chain rows with registered author and unexpired;
// archived = cached rows now past expiry (expired entities vanish from queries).
// A null allowlist (TEMP-DEMO open access) allows every row.
export function splitFeed(
  live: ChainPost[],
  allowlist: Set<string> | null,
  currentBlock: bigint,
  commentCounts: Map<string, number>,
  cache: FeedCache,
): { posts: FeedPost[]; archived: FeedPost[] } {
  const toISO = (block: bigint) =>
    new Date(Date.now() + Number(block - currentBlock) * BLOCK_SECONDS * 1000).toISOString();
  const allowed = (w: unknown): w is string =>
    typeof w === "string" && (allowlist === null || allowlist.has(w.toLowerCase()));
  const posts: FeedPost[] = [];
  for (const p of live) {
    if (!allowed(p.author)) continue;
    if (p.expiresAtBlock <= currentBlock) continue;
    posts.push({
      key: p.key,
      title: p.title,
      excerpt: makeExcerpt(p.body ?? ""),
      owner: p.owner,
      expiresAt: toISO(p.expiresAtBlock),
      commentCount: commentCounts.get(p.key) ?? 0,
      expired: false,
    });
  }
  const liveKeys = new Set(live.map((p) => p.key));
  // Read-through: rows the query index does not have yet (a just-published
  // post sits only in the write-through cache) still show as live while
  // unexpired. Every cached row passed the allowlist at ingestion, and the
  // write-through row is server-created from verified input. Newest first.
  // Malformed rows are skipped so one bad cache entry can never empty the feed.
  const pending = cache.posts
    .filter((c) => {
      if (liveKeys.has(c.key) || typeof c.owner !== "string" || typeof c.expiresAtBlock !== "string") {
        return false;
      }
      try {
        return BigInt(c.expiresAtBlock) > currentBlock && allowed(c.owner);
      } catch {
        return false;
      }
    })
    .sort((a, b) => (a.postKey < b.postKey ? 1 : a.postKey > b.postKey ? -1 : 0))
    .map((c) => ({
      key: c.key,
      title: c.title,
      excerpt: c.excerpt ?? "",
      owner: c.owner,
      expiresAt: toISO(BigInt(c.expiresAtBlock)),
      commentCount: commentCounts.get(c.key) ?? 0,
      expired: false,
    }));
  posts.unshift(...pending);
  const archived: FeedPost[] = [];
  for (const c of cache.posts) {
    if (liveKeys.has(c.key)) continue;
    let exp: bigint;
    try {
      exp = BigInt(c.expiresAtBlock as string);
    } catch {
      continue;
    }
    if (exp > currentBlock) continue;
    // Archived rows must pass the same allowlist as live: the cache may
    // hold sponsor-owned rows with unregistered authors (hidden while live).
    if (!allowed(c.owner)) continue;
    archived.push({
      key: c.key,
      title: c.title,
      excerpt: c.excerpt ?? "",
      owner: c.owner,
      expiresAt: toISO(exp),
      commentCount: 0,
      expired: true,
    });
  }
  return { posts, archived };
}

export function upsertCache(cache: FeedCache, live: ChainPost[], allowlist?: Set<string> | null): FeedCache {
  const seen = new Map(cache.posts.map((p) => [p.key, p]));
  for (const p of live) {
    // Never ingest rows whose author is not registered: they are hidden
    // while live and must not surface from the cache after expiry.
    // A null allowlist (TEMP-DEMO open access) ingests everything.
    if (allowlist && !allowlist.has(p.author.toLowerCase())) continue;
    seen.set(p.key, {
      key: p.key,
      title: p.title,
      excerpt: makeExcerpt(p.body ?? ""),
      owner: p.owner,
      postKey: p.postKey,
      expiresAtBlock: p.expiresAtBlock.toString(),
    });
  }
  const out: FeedCache["posts"] = [];
  seen.forEach((p) => {
    // Prune rows cached before the ingestion filter existed.
    if (allowlist && !allowlist.has(p.owner.toLowerCase())) return;
    out.push(p);
  });
  return { version: 3, posts: out };
}

function colVal(v: unknown): string {
  if (v !== null && typeof v === "object" && "value" in v) return String((v as { value: unknown }).value);
  return String(v);
}

export async function fetchLivePosts(sponsor: Hex): Promise<{ posts: ChainPost[]; currentBlock: bigint }> {
  const timing = await publicClient.getBlockTiming();
  const currentBlock = timing.currentBlock;
  const posts: ChainPost[] = [];
  let offset = 0;
  for (;;) {
    const page = await publicClient
      .select({ $key: true, $owner: true, $expiresAt: true, author: true, postKey: true, title: true, body: true })
      .from(Posts)
      .ownedBy(sponsor)
      .orderBy(desc("postKey"))
      .limit(PAGE_LIMIT)
      .offset(offset)
      .fetch();
    for (const e of page.entities) {
      const r = e as Record<string, unknown>;
      const author = colVal(r.author);
      posts.push({
        key: String(r.$key),
        // User-facing owner is the author: $owner is always the sponsor
        // wallet (it signs every write), so it must never be displayed.
        // Server-side extend/edit checks use the author column (manage.ts).
        owner: author,
        author,
        postKey: colVal(r.postKey),
        title: colVal(r.title),
        body: decodeBodyCell(r.body),
        expiresAtBlock: BigInt(String(r.$expiresAt)),
      });
    }
    if (page.entities.length < PAGE_LIMIT) break;
    offset += page.entities.length;
  }
  return { posts, currentBlock };
}

// Counts the comments filed under a post. parentKey is the parent post's
// ENTITY KEY ($key): comment rows store the parent's $key in their postKey
// column (thread URLs and the comments API both use $key), not the random
// postKey column from Posts. Counting by the column never matches.
export async function countComments(parentKey: string, sponsor: Hex): Promise<number> {
  const { eq } = await import("@arkiv-network/sdk/query");
  const n = await publicClient.count().from(Comments).ownedBy(sponsor).where(eq("postKey", parentKey)).fetch();
  return Number(n);
}

// Single-post read for the thread view: same trust filters as the feed
// (sponsor ownership + registered author + unexpired), plus the body.
// Uses a direct entity read, not the query index, so a just-created post is
// visible before the index catches up.
export async function fetchPostDetail(
  entityKey: string,
  sponsor: Hex,
  allowlist: Set<string> | null,
): Promise<ThreadPostDetail | undefined> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(entityKey)) return undefined;
  let e: Record<string, unknown>;
  try {
    e = (await publicClient.getEntity(entityKey as Hex, Posts)) as unknown as Record<string, unknown>;
  } catch {
    return undefined;
  }
  const owner = colVal(e.$owner);
  if (owner.toLowerCase() !== sponsor.toLowerCase()) return undefined;
  const author = colVal(e.author);
  if (allowlist !== null && !allowlist.has(author.toLowerCase())) return undefined;
  const expiresAtBlock = BigInt(String(e.$expiresAt));
  const timing = await publicClient.getBlockTiming();
  const expired = expiresAtBlock <= timing.currentBlock;
  if (expired) return undefined;
  return {
    key: String(e.$key),
    title: colVal(e.title),
    body: decodeBodyCell(e.body),
    owner: author,
    expiresAt: new Date(
      Date.now() + Number(expiresAtBlock - timing.currentBlock) * BLOCK_SECONDS * 1000,
    ).toISOString(),
    expired: false,
  };
}
