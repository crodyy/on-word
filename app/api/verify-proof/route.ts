import { NextRequest, NextResponse } from "next/server";
import { VerifyError, getDefaultVerifyStore, verifyProof } from "@/lib/worldid/verify";
import type { ApiError, VerifyProofSuccess } from "@/lib/types";

const FALLBACK_ACTION = "human-forum-register-v1";
const NONCE_PATH = process.env.NONCE_PATH ?? "./data/nonces.json";

export async function POST(req: NextRequest): Promise<NextResponse<VerifyProofSuccess | ApiError>> {
  const body = (await req.json().catch(() => null)) as {
    idkitResponse?: unknown;
    wallet?: unknown;
    signature?: unknown;
    nonce?: unknown;
  } | null;
  if (
    !body ||
    typeof body.wallet !== "string" ||
    body.idkitResponse == null ||
    typeof body.signature !== "string" ||
    typeof body.nonce !== "string"
  ) {
    return NextResponse.json({ error: "verify-failed" }, { status: 400 });
  }
  try {
    const result = await verifyProof(
      { idkitResponse: body.idkitResponse, wallet: body.wallet, signature: body.signature, nonce: body.nonce },
      {
        store: getDefaultVerifyStore(),
        rpId: process.env.WORLD_RP_ID ?? "",
        expectedAction: process.env.WORLD_ACTION_REGISTER ?? FALLBACK_ACTION,
        expectedEnv: process.env.WORLD_ENVIRONMENT ?? "staging",
        noncePath: NONCE_PATH,
      },
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof VerifyError && err.code === "worldid-reused") {
      return NextResponse.json({ error: "worldid-reused" }, { status: 409 });
    }
    if (err instanceof VerifyError && err.code === "wallet-reused") {
      return NextResponse.json({ error: "wallet-reused" }, { status: 409 });
    }
    // Server log carries the specific reason; the client stays generic.
    // Never log the proof, nullifier, or wallet here.
    const reason = err instanceof VerifyError ? err.message : "unexpected";
    console.error(`[verify-proof] failed: ${reason}`);
    return NextResponse.json({ error: "verify-failed" }, { status: 400 });
  }
}
