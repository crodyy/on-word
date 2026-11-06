import { NextRequest, NextResponse } from "next/server";
import { VerifyError, defaultVerifyStore, verifyProof } from "@/lib/worldid/verify";
import type { ApiError, VerifyProofSuccess } from "@/lib/types";

const FALLBACK_ACTION = "human-forum-register-v1";

export async function POST(req: NextRequest): Promise<NextResponse<VerifyProofSuccess | ApiError>> {
  const body = (await req.json().catch(() => null)) as {
    idkitResponse?: unknown;
    wallet?: unknown;
  } | null;
  if (!body || typeof body.wallet !== "string" || body.idkitResponse == null) {
    return NextResponse.json({ error: "verify-failed" }, { status: 400 });
  }
  try {
    const result = await verifyProof(
      { idkitResponse: body.idkitResponse, wallet: body.wallet },
      {
        store: defaultVerifyStore,
        rpId: process.env.WORLD_RP_ID ?? "",
        expectedAction: process.env.WORLD_ACTION_REGISTER ?? FALLBACK_ACTION,
        expectedEnv: process.env.WORLD_ENVIRONMENT ?? "staging",
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
    return NextResponse.json({ error: "verify-failed" }, { status: 400 });
  }
}
