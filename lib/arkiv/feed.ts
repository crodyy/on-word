import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { desc, eq } from "@arkiv-network/sdk/query";
import { key as keyVal } from "@arkiv-network/sdk/schema";
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
export function splitFeed(
  live: ChainPost[],
  allowlist: Set<string>,
  currentBlock: bigint,
  commentCounts: Map<string, number>,
  cache: FeedCache,
): { posts: FeedPost[]; archived: FeedPost[] } {
  const toISO = (block: bigint) =>
    new Date(Date.now() + Number(block - currentBlock) * BLOCK_SECONDS * 1000).toISOString();
  const posts: FeedPost[] = [];
  for (const p of live) {
    if (!allowlist.has(p.author.toLowerCase())) continue;
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
  const archived: FeedPost[] = [];
  for (const c of cache.posts) {
    if (liveKeys.has(c.key)) continue;
    if (BigInt(c.expiresAtBlock) > currentBlock) continue;
    // Archived rows must pass the same allowlist as live: the cache may
    // hold sponsor-owned rows with unregistered authors (hidden while live).
    if (!allowlist.has(c.owner.toLowerCase())) continue;
    archived.push({
      key: c.key,
      title: c.title,
      excerpt: c.excerpt ?? "",
      owner: c.owner,
      expiresAt: toISO(BigInt(c.expiresAtBlock)),
      commentCount: 0,
      expired: true,
    });
  }
  return { posts, archived };
}

export function upsertCache(cache: FeedCache, live: ChainPost[], allowlist?: Set<string>): FeedCache {
  const seen = new Map(cache.posts.map((p) => [p.key, p]));
  for (const p of live) {
    // Never ingest rows whose author is not registered: they are hidden
    // while live and must not surface from the cache after expiry.
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
export async function fetchPostDetail(
  entityKey: string,
  sponsor: Hex,
  allowlist: Set<string>,
): Promise<ThreadPostDetail | undefined> {
  const timing = await publicClient.getBlockTiming();
  const page = await publicClient
    .select({
      $key: true,
      $owner: true,
      $expiresAt: true,
      author: true,
      postKey: true,
      title: true,
      body: true,
    })
    .from(Posts)
    .ownedBy(sponsor)
    .where(eq("$key", keyVal(entityKey as Hex)))
    .limit(1)
    .fetch();
  if (page.entities.length === 0) return undefined;
  const r = page.entities[0] as Record<string, unknown>;
  const author = colVal(r.author);
  if (!allowlist.has(author.toLowerCase())) return undefined;
  const expiresAtBlock = BigInt(String(r.$expiresAt));
  const expired = expiresAtBlock <= timing.currentBlock;
  if (expired) return undefined;
  return {
    key: String(r.$key),
    title: colVal(r.title),
    body: decodeBodyCell(r.body),
    owner: author,
    expiresAt: new Date(
      Date.now() + Number(expiresAtBlock - timing.currentBlock) * BLOCK_SECONDS * 1000,
    ).toISOString(),
    expired: false,
  };
}
