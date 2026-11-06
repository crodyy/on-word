import { ExpirationTime } from "@arkiv-network/sdk";
import { addr } from "@arkiv-network/sdk/schema";
import { eq } from "@arkiv-network/sdk/query";
import type { Hex } from "viem";
import { getWalletClient, publicClient } from "./client";
import { getSponsorAddress } from "./client";
import { Comments, Posts } from "./schemas";

export const COMMENT_DAYS = 7;
export const MAX_COMMENT_BYTES = 5 * 1024;

export function validateCommentInput(input: { postKey: string; body: string }): void {
  if (typeof input.postKey !== "string" || input.postKey.length === 0) {
    throw new Error("postKey required");
  }
  const n = new TextEncoder().encode(input.body ?? "").length;
  if (n === 0 || n > MAX_COMMENT_BYTES) throw new Error("body must be 1B..5KB");
}

export interface ParentPost {
  key: string;
  author: string;
  expiresAtBlock: bigint;
}

function colVal(v: unknown): string {
  if (v !== null && typeof v === "object" && "value" in v) return String((v as { value: unknown }).value);
  return String(v);
}

// Parent must exist under our sponsor ownership and be unexpired. The
// allowlist is deliberately NOT required here: comments on hidden posts stay
// hidden with them, and the probe post (unregistered author) stays usable.
export async function fetchParentPost(postKey: string): Promise<ParentPost | undefined> {
  const page = await publicClient
    .select({ $key: true, $expiresAt: true, author: true })
    .from(Posts)
    .ownedBy(getSponsorAddress())
    .where(eq("postKey", postKey))
    .limit(1)
    .fetch();
  if (page.entities.length === 0) return undefined;
  const r = page.entities[0] as Record<string, unknown>;
  return { key: String(r.$key), author: colVal(r.author), expiresAtBlock: BigInt(String(r.$expiresAt)) };
}

export async function createCommentEntity(input: {
  authorWallet: Hex;
  postKey: string;
  body: string;
}): Promise<{ entityKey: Hex; expiresAt: bigint; txHash: Hex }> {
  validateCommentInput(input);
  const bodyBytes = new TextEncoder().encode(input.body);
  const client = getWalletClient();
  const { entityKey, expiresAt, txHash } = await client.createEntity(
    Comments,
    { postKey: input.postKey, author: addr(input.authorWallet), body: bodyBytes },
    { expiration: ExpirationTime.fromDays(COMMENT_DAYS) },
  );
  return { entityKey, expiresAt, txHash };
}
