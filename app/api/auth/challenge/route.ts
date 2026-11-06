import { NextRequest, NextResponse } from "next/server";
import { issueChallenge } from "@/lib/auth/challenge";
import type { ApiError, AuthChallengeResponse } from "@/lib/types";

const NONCE_PATH = process.env.NONCE_PATH ?? "./data/nonces.json";

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;

// Open to any well-formed address: signup needs a nonce before any binding
// exists. Issuance grants nothing by itself; the signature is verified on
// every write and at registration.
export async function GET(req: NextRequest): Promise<NextResponse<AuthChallengeResponse | ApiError>> {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet || !WALLET_RE.test(wallet)) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  try {
    const res = await issueChallenge(wallet, { path: NONCE_PATH });
    return NextResponse.json(res);
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 500 });
  }
}
