import { NextRequest, NextResponse } from "next/server";
import { EntityMutationError } from "@arkiv-network/sdk";
import { getDefaultStore } from "@/lib/registry/store";
import { assertWriteAuth } from "@/lib/auth/challenge";
import { assertOwner, editPostEntity, fetchManagedPost } from "@/lib/arkiv/manage";
import { MAX_BODY_BYTES, MAX_TITLE_BYTES } from "@/lib/arkiv/posts";
import type { ApiError, EditPostResponse } from "@/lib/types";

const NONCE_PATH = process.env.NONCE_PATH ?? "./data/nonces.json";

export async function POST(
  req: NextRequest,
  { params }: { params: { key: string } },
): Promise<NextResponse<EditPostResponse | ApiError>> {
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
