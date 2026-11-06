import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { EntityMutationError } from "@arkiv-network/sdk";
import type { Hex } from "viem";
import { getDefaultStore } from "@/lib/registry/store";
import { createPostEntity, validatePostInput } from "@/lib/arkiv/posts";
import { checkAndRecord, RateLimitedError } from "@/lib/arkiv/rateLimit";
import type { ApiError, CreatePostResponse } from "@/lib/types";

const RATE_PATH = process.env.RATELIMIT_PATH ?? "./data/ratelimit.json";

export async function POST(req: NextRequest): Promise<NextResponse<CreatePostResponse | ApiError>> {
  const wallet = req.headers.get("x-wallet");
  if (!wallet) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const binding = await getDefaultStore().getBinding(wallet).catch(() => undefined);
  if (!binding) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as {
    title?: unknown;
    body?: unknown;
    days?: unknown;
  } | null;
  if (
    !body ||
    typeof body.title !== "string" ||
    typeof body.body !== "string" ||
    typeof body.days !== "number"
  ) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  try {
    validatePostInput({ title: body.title, body: body.body, days: body.days });
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  try {
    await checkAndRecord(binding.wallet, { path: RATE_PATH });
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return NextResponse.json({ error: "rate-limited" }, { status: 429 });
    }
    throw err;
  }
  try {
    const postKey = `${Date.now()}-${randomBytes(8).toString("hex")}`;
    const res = await createPostEntity({
      authorWallet: binding.wallet as Hex,
      postKey,
      title: body.title,
      body: body.body,
      days: body.days,
    });
    return NextResponse.json({ entityKey: res.entityKey });
  } catch (err) {
    if (err instanceof EntityMutationError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw err;
  }
}
