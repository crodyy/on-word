import { NextRequest, NextResponse } from "next/server";
import { EntityMutationError } from "@arkiv-network/sdk";
import type { Hex } from "viem";
import { getDefaultStore } from "@/lib/registry/store";
import { createCommentEntity, fetchParentPost, validateCommentInput } from "@/lib/arkiv/comments";
import { publicClient } from "@/lib/arkiv/client";
import type { ApiError, CreateCommentResponse } from "@/lib/types";

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
