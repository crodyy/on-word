import { NextResponse } from "next/server";
import { getDefaultStore } from "@/lib/registry/store";
import { fetchPostDetail } from "@/lib/arkiv/feed";
import { getSponsorAddress } from "@/lib/arkiv/client";
import type { ApiError, ThreadPost } from "@/lib/types";

export async function GET(
  _req: Request,
  { params }: { params: { key: string } },
): Promise<NextResponse<ThreadPost | ApiError>> {
  if (!params.key || !/^0x[0-9a-fA-F]{64}$/.test(params.key)) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  try {
    const allowlist = new Set(
      (await getDefaultStore().getAllowlist()).map((w) => w.toLowerCase()),
    );
    const detail = await fetchPostDetail(params.key, getSponsorAddress(), allowlist);
    if (!detail) return NextResponse.json({ error: "not-found" }, { status: 404 });
    return NextResponse.json({
      key: detail.key,
      title: detail.title,
      body: detail.body,
      owner: detail.owner,
      expiresAt: detail.expiresAt,
    });
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 500 });
  }
}
