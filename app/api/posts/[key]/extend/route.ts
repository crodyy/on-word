import { NextRequest, NextResponse } from "next/server";
import { EntityMutationError } from "@arkiv-network/sdk";
import { getDefaultStore } from "@/lib/registry/store";
import { assertOwner, extendPostEntity, fetchManagedPost } from "@/lib/arkiv/manage";
import { assertPostLifetime } from "@/lib/arkiv/posts";
import type { ApiError, ExtendPostResponse } from "@/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: { key: string } },
): Promise<NextResponse<ExtendPostResponse | ApiError>> {
  const wallet = req.headers.get("x-wallet");
  if (!wallet) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const binding = await getDefaultStore().getBinding(wallet).catch(() => undefined);
  if (!binding) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const post = await fetchManagedPost(params.key).catch(() => undefined);
  if (!post) return NextResponse.json({ error: "not-found" }, { status: 404 });
  try {
    await assertOwner(post, wallet);
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { days?: unknown } | null;
  if (!body || typeof body.days !== "number") {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  try {
    assertPostLifetime(body.days);
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  try {
    const res = await extendPostEntity(params.key, body.days);
    return NextResponse.json(res);
  } catch (err) {
    if (err instanceof EntityMutationError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw err;
  }
}
