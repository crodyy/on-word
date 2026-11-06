import { NextResponse } from "next/server";
import type { ApiError, WorldConfigResponse } from "@/lib/types";

const FALLBACK_ACTION = "human-forum-register-v1";

// Public identifiers only (visible in every proof request by design).
// Never put secrets here. Prefers NEXT_PUBLIC_* when set (build-time),
// falls back to server WORLD_* so a server-only .env.local still works.
export async function GET(): Promise<
  NextResponse<WorldConfigResponse | ApiError>
> {
  const appId =
    process.env.NEXT_PUBLIC_WORLD_APP_ID || process.env.WORLD_APP_ID || "";
  const rpId =
    process.env.NEXT_PUBLIC_WORLD_RP_ID || process.env.WORLD_RP_ID || "";
  const action =
    process.env.NEXT_PUBLIC_WORLD_ACTION ||
    process.env.WORLD_ACTION_REGISTER ||
    FALLBACK_ACTION;
  const rawEnv =
    process.env.NEXT_PUBLIC_WORLD_ENVIRONMENT ||
    process.env.WORLD_ENVIRONMENT ||
    "staging";
  const environment =
    rawEnv === "production" || rawEnv === "sandbox" ? rawEnv : "staging";

  if (!appId.startsWith("app_") || rpId.length === 0) {
    return NextResponse.json({ error: "bad-request" }, { status: 503 });
  }
  return NextResponse.json({
    app_id: appId as `app_${string}`,
    rp_id: rpId,
    action,
    environment,
  });
}
