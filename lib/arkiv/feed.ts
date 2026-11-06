import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { desc } from "@arkiv-network/sdk/query";
import type { Hex } from "viem";
import { publicClient } from "./client";
import { Comments, Posts } from "./schemas";

export const BLOCK_SECONDS = 2;
export const PAGE_LIMIT = 100;

export interface ChainPost {
  key: string;
  owner: string;
  author: string;
  postKey: string;
  title: string;
  expiresAtBlock: bigint;
}

export interface FeedPost {
  key: string;
  title: string;
  owner: string;
  expiresAt: string;
  commentCount: number;
  expired: boolean;
}

export interface FeedCache {
  version: 1;
  posts: {
    key: string;
    title: string;
    owner: string;
    postKey: string;
    expiresAtBlock: string;
  }[];
}

export function emptyCache(): FeedCache {
  return { version: 1, posts: [] };
}

export async function loadCache(path: string): Promise<FeedCache> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as FeedCache;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyCache();
    throw err;
  }
}

export async function saveCache(path: string, cache: FeedCache): Promise<void> {
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
    archived.push({
      key: c.key,
      title: c.title,
      owner: c.owner,
      expiresAt: toISO(BigInt(c.expiresAtBlock)),
      commentCount: 0,
      expired: true,
    });
  }
  return { posts, archived };
}

export function upsertCache(cache: FeedCache, live: ChainPost[]): FeedCache {
  const seen = new Map(cache.posts.map((p) => [p.key, p]));
  for (const p of live) {
    seen.set(p.key, {
      key: p.key,
      title: p.title,
      owner: p.owner,
      postKey: p.postKey,
      expiresAtBlock: p.expiresAtBlock.toString(),
    });
  }
  const out: FeedCache["posts"] = [];
  seen.forEach((p) => {
    out.push(p);
  });
  return { version: 1, posts: out };
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
      .select({ $key: true, $owner: true, $expiresAt: true, author: true, postKey: true, title: true })
      .from(Posts)
      .ownedBy(sponsor)
      .orderBy(desc("postKey"))
      .limit(PAGE_LIMIT)
      .offset(offset)
      .fetch();
    for (const e of page.entities) {
      const r = e as Record<string, unknown>;
      posts.push({
        key: String(r.$key),
        owner: String(r.$owner),
        author: colVal(r.author),
        postKey: colVal(r.postKey),
        title: colVal(r.title),
        expiresAtBlock: BigInt(String(r.$expiresAt)),
      });
    }
    if (page.entities.length < PAGE_LIMIT) break;
    offset += page.entities.length;
  }
  return { posts, currentBlock };
}

export async function countComments(postKey: string): Promise<number> {
  const { eq } = await import("@arkiv-network/sdk/query");
  const n = await publicClient.count().from(Comments).where(eq("postKey", postKey)).fetch();
  return Number(n);
}
