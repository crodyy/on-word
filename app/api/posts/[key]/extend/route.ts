import { NextRequest, NextResponse } from "next/server";
import { EntityMutationError } from "@arkiv-network/sdk";
import { getDefaultStore } from "@/lib/registry/store";
import { assertWriteAuth } from "@/lib/auth/challenge";
import { assertOwner, extendPostEntity, fetchManagedPost } from "@/lib/arkiv/manage";
import { assertPostLifetime, assertPostLifetimeHours } from "@/lib/arkiv/posts";
import type { ApiError, ExtendPostResponse } from "@/lib/types";

const NONCE_PATH = process.env.NONCE_PATH ?? "./data/nonces.json";

export async function POST(
  req: NextRequest,
  { params }: { params: { key: string } },
): Promise<NextResponse<ExtendPostResponse | ApiError>> {
  const body = (await req.json().catch(() => null)) as { days?: unknown; hours?: unknown } | null;
  if (!body || (typeof body.days !== "number" && typeof body.hours !== "number")) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  let lifetime: 1 | 3 | 5 | { hours: 1 };
  try {
    if (typeof body.hours === "number") {
      assertPostLifetimeHours(body.hours);
      lifetime = { hours: body.hours as 1 };
    } else {
      assertPostLifetime(body.days as number);
      lifetime = body.days as 1 | 3 | 5;
    }
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

  const post = await fetchManagedPost(params.key).catch(() => undefined);
  if (!post) return NextResponse.json({ error: "not-found" }, { status: 404 });
  try {
    await assertOwner(post, wallet);
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const res = await extendPostEntity(params.key, lifetime);
    return NextResponse.json(res);
  } catch (err) {
    if (err instanceof EntityMutationError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw err;
  }
}
