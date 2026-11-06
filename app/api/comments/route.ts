import { NextRequest, NextResponse } from "next/server";
import { EntityMutationError } from "@arkiv-network/sdk";
import { eq } from "@arkiv-network/sdk/query";
import type { Hex } from "viem";
import { getDefaultStore } from "@/lib/registry/store";
import { createCommentEntity, fetchParentPost, validateCommentInput } from "@/lib/arkiv/comments";
import { getSponsorAddress, publicClient } from "@/lib/arkiv/client";
import { Comments } from "@/lib/arkiv/schemas";
import type { ApiError, CommentsResponse, CreateCommentResponse } from "@/lib/types";

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
  const wallet = req.headers.get("x-wallet");
  if (!wallet) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const binding = await getDefaultStore().getBinding(wallet).catch(() => undefined);
  if (!binding) return NextResponse.json({ error: "forbidden" }, { status: 403 });

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

  let parent;
  try {
    parent = await fetchParentPost(body.postKey);
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  if (!parent) return NextResponse.json({ error: "not-found" }, { status: 404 });
  const timing = await publicClient.getBlockTiming().catch(() => undefined);
  if (!timing || parent.expiresAtBlock <= timing.currentBlock) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  try {
    const res = await createCommentEntity({
      authorWallet: binding.wallet as Hex,
      postKey: body.postKey,
      body: body.body,
    });
    return NextResponse.json({ entityKey: res.entityKey });
  } catch (err) {
    if (err instanceof EntityMutationError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw err;
  }
}
