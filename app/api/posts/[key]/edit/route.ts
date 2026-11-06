import { NextRequest, NextResponse } from "next/server";
import { EntityMutationError } from "@arkiv-network/sdk";
import { getDefaultStore } from "@/lib/registry/store";
import { assertOwner, editPostEntity, fetchManagedPost } from "@/lib/arkiv/manage";
import { MAX_BODY_BYTES, MAX_TITLE_BYTES } from "@/lib/arkiv/posts";
import type { ApiError, EditPostResponse } from "@/lib/types";

export async function POST(
  req: NextRequest,
  { params }: { params: { key: string } },
): Promise<NextResponse<EditPostResponse | ApiError>> {
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

  const body = (await req.json().catch(() => null)) as {
    title?: unknown;
    body?: unknown;
  } | null;
  if (!body || (typeof body.title !== "string" && typeof body.body !== "string")) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  if (
    (typeof body.title === "string" && Buffer.byteLength(body.title, "utf8") > MAX_TITLE_BYTES) ||
    (typeof body.body === "string" && new TextEncoder().encode(body.body).length > MAX_BODY_BYTES)
  ) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  try {
    await editPostEntity(params.key, {
      ...(typeof body.title === "string" ? { title: body.title } : {}),
      ...(typeof body.body === "string" ? { body: body.body } : {}),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof EntityMutationError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw err;
  }
}
