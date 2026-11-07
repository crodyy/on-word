import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { EntityMutationError } from "@arkiv-network/sdk";
import type { Hex } from "viem";
import { getDefaultStore } from "@/lib/registry/store";
import { createPostEntity, validatePostInput } from "@/lib/arkiv/posts";
import { assertWriteAuth } from "@/lib/auth/challenge";
import { checkAndRecord, RateLimitedError, releaseSlot } from "@/lib/arkiv/rateLimit";
import { countComments, fetchLivePosts, loadCache, saveCache, splitFeed, upsertCache } from "@/lib/arkiv/feed";
import type { ChainPost } from "@/lib/arkiv/feed";
import { getSponsorAddress } from "@/lib/arkiv/client";
import type { ApiError, CreatePostResponse, FeedResponse } from "@/lib/types";

const RATE_PATH = process.env.RATELIMIT_PATH ?? "./data/ratelimit.json";
const NONCE_PATH = process.env.NONCE_PATH ?? "./data/nonces.json";

export async function POST(req: NextRequest): Promise<NextResponse<CreatePostResponse | ApiError>> {
  const body = (await req.json().catch(() => null)) as {
    title?: unknown;
    body?: unknown;
    days?: unknown;
    hours?: unknown;
  } | null;
  if (
    !body ||
    typeof body.title !== "string" ||
    typeof body.body !== "string" ||
    (typeof body.days !== "number" && typeof body.hours !== "number")
  ) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  try {
    validatePostInput({ title: body.title, body: body.body, days: body.days as number | undefined, hours: body.hours as number | undefined });
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  // The x-wallet header is only a hint. The caller must prove ownership with
  // a fresh signature over a server-issued nonce. Every failure is a 403.
  let wallet: string;
  try {
    wallet = await assertWriteAuth(
      {
        wallet: req.headers.get("x-wallet"),
        nonce: req.headers.get("x-auth-nonce"),
        signature: req.headers.get("x-auth-signature"),
      },
      { getBinding: (w) => getDefaultStore().getBinding(w), noncePath: NONCE_PATH },
    );
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    await checkAndRecord(wallet, { path: RATE_PATH });
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return NextResponse.json({ error: "rate-limited" }, { status: 429 });
    }
    throw err;
  }
  try {
    const postKey = `${Date.now()}-${randomBytes(8).toString("hex")}`;
    const res = await createPostEntity({
      authorWallet: wallet as Hex,
      postKey,
      title: body.title,
      body: body.body,
      ...(typeof body.hours === "number" ? { hours: body.hours } : { days: body.days as number }),
    });
    // Write-through: the chain query index can lag behind a fresh write and
    // the thread view gates on the feed, so cache our own row immediately.
    // No allowlist filter: the row is server-created from verified input.
    // Cache failures must not fail the publish.
    const cacheRow: ChainPost = {
      key: res.entityKey,
      owner: wallet.toLowerCase(),
      author: wallet.toLowerCase(),
      postKey,
      title: body.title,
      body: body.body,
      expiresAtBlock: res.expiresAt,
    };
    await loadCache(CACHE_PATH)
      .then((cache) => saveCache(CACHE_PATH, upsertCache(cache, [cacheRow])))
      .catch(() => undefined);
    return NextResponse.json({ entityKey: res.entityKey });
  } catch (err) {
    // Failed chain writes must not burn daily quota.
    await releaseSlot(wallet, { path: RATE_PATH }).catch(() => undefined);
    if (err instanceof EntityMutationError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw err;
  }
}

const CACHE_PATH = process.env.FEED_CACHE_PATH ?? "./data/cache.json";

export async function GET(): Promise<NextResponse<FeedResponse | ApiError>> {
  try {
    const sponsor = getSponsorAddress();
    const allowlist = new Set(
      (await getDefaultStore().getAllowlist()).map((w) => w.toLowerCase()),
    );
    const { posts, currentBlock } = await fetchLivePosts(sponsor);
    const cache = await loadCache(CACHE_PATH);
    const counts = new Map<string, number>();
    for (const p of posts) {
      try {
        counts.set(p.key, await countComments(p.key, sponsor));
      } catch {
        counts.set(p.key, 0);
      }
    }
    const feed = splitFeed(posts, allowlist, currentBlock, counts, cache);
    await saveCache(CACHE_PATH, upsertCache(cache, posts, allowlist)).catch(() => undefined);
    return NextResponse.json(feed);
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 500 });
  }
}
