import { NextRequest, NextResponse } from "next/server";
import { EntityMutationError } from "@arkiv-network/sdk";
import { eq } from "@arkiv-network/sdk/query";
import type { Hex } from "viem";
import { getDefaultStore } from "@/lib/registry/store";
import { createCommentEntity, fetchParentPost, validateCommentInput } from "@/lib/arkiv/comments";
import { assertWriteAuth } from "@/lib/auth/challenge";
import { getSponsorAddress, publicClient } from "@/lib/arkiv/client";
import { checkAndRecord, RateLimitedError, releaseSlot } from "@/lib/arkiv/rateLimit";
import { Comments } from "@/lib/arkiv/schemas";
import type { ApiError, CommentsResponse, CreateCommentResponse } from "@/lib/types";

const COMMENT_RATE_PATH = process.env.COMMENT_RATELIMIT_PATH ?? "./data/ratelimit-comments.json";
const NONCE_PATH = process.env.NONCE_PATH ?? "./data/nonces.json";

export async function GET(req: NextRequest): Promise<NextResponse<CommentsResponse | ApiError>> {
  const postKey = req.nextUrl.searchParams.get("postKey");
  if (!postKey) return NextResponse.json({ error: "bad-request" }, { status: 400 });
  try {
    const allowlist = new Set(
      (await getDefaultStore().getAllowlist()).map((w) => w.toLowerCase()),
    );
    const timing = await publicClient.getBlockTiming();
    const page = await publicClient
      .select({ $key: true, $expiresAt: true, author: true, body: true })
      .from(Comments)
      .ownedBy(getSponsorAddress())
      .where(eq("postKey", postKey))
      .limit(100)
      .fetch();
    const comments = [];
    for (const e of page.entities) {
      const r = e as unknown as Record<string, unknown>;
      const author = String((r.author as { value: unknown }).value ?? r.author);
      if (!allowlist.has(author.toLowerCase())) continue;
      if (BigInt(String(r.$expiresAt)) <= timing.currentBlock) continue;
      const raw = (r.body as { value: unknown }).value ?? r.body;
      const text =
        typeof raw === "string"
          ? raw.startsWith("0x")
            ? new TextDecoder().decode(
                Uint8Array.from(Buffer.from(raw.slice(2), "hex")),
              )
            : raw
          : new TextDecoder().decode(raw as Uint8Array);
      comments.push({
        key: String(r.$key),
        author,
        body: text,
        expiresAt: new Date(
          Date.now() + Number(BigInt(String(r.$expiresAt)) - timing.currentBlock) * 2000,
        ).toISOString(),
      });
    }
    return NextResponse.json({ comments });
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<CreateCommentResponse | ApiError>> {
  const body = (await req.json().catch(() => null)) as {
    postKey?: unknown;
    body?: unknown;
  } | null;
  if (!body || typeof body.postKey !== "string" || typeof body.body !== "string") {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  try {
    validateCommentInput({ postKey: body.postKey, body: body.body });
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

  // Throttle before any chain read: throttled callers cost us nothing.
  try {
    await checkAndRecord(wallet, { path: COMMENT_RATE_PATH });
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return NextResponse.json({ error: "rate-limited" }, { status: 429 });
    }
    throw err;
  }

  let parent;
  try {
    parent = await fetchParentPost(body.postKey);
  } catch {
    await releaseSlot(wallet, { path: COMMENT_RATE_PATH }).catch(() => undefined);
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  if (!parent) {
    await releaseSlot(wallet, { path: COMMENT_RATE_PATH }).catch(() => undefined);
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  const timing = await publicClient.getBlockTiming().catch(() => undefined);
  if (!timing || parent.expiresAtBlock <= timing.currentBlock) {
    await releaseSlot(wallet, { path: COMMENT_RATE_PATH }).catch(() => undefined);
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  try {
    const res = await createCommentEntity({
      authorWallet: wallet as Hex,
      postKey: body.postKey,
      body: body.body,
    });
    return NextResponse.json({ entityKey: res.entityKey });
  } catch (err) {
    // Failed chain writes must not burn daily quota.
    await releaseSlot(wallet, { path: COMMENT_RATE_PATH }).catch(() => undefined);
    if (err instanceof EntityMutationError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw err;
  }
}
