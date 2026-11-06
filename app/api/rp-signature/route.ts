import { NextRequest, NextResponse } from "next/server";
import { signRequest } from "@worldcoin/idkit-core/signing";
import type { ApiError, RpSignatureResponse } from "@/lib/types";

const FALLBACK_ACTION = "human-forum-register-v1";

export async function POST(req: NextRequest): Promise<NextResponse<RpSignatureResponse | ApiError>> {
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  const expected = process.env.WORLD_ACTION_REGISTER ?? FALLBACK_ACTION;
  if (!body || body.action !== expected) {
    return NextResponse.json({ error: "bad-action" }, { status: 400 });
  }
  const key = process.env.RP_SIGNING_KEY;
  if (!key) {
    return NextResponse.json({ error: "bad-request" }, { status: 500 });
  }
  const { sig, nonce, createdAt, expiresAt } = signRequest({
    signingKeyHex: key,
    action: expected,
  });
  return NextResponse.json({ sig, nonce, created_at: createdAt, expires_at: expiresAt });
}
