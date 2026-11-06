import { ExpirationTime } from "@arkiv-network/sdk";
import { addr } from "@arkiv-network/sdk/schema";
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
// NOTE: callers pass the post's entity key ($key), not the postKey column
// (a random id generated at creation). So this reads the entity directly
// instead of filtering Posts.postKey, which would never match.
export async function fetchParentPost(entityKey: string): Promise<ParentPost | undefined> {
  try {
    const e = (await publicClient.getEntity(
      entityKey as Hex,
      Posts,
    )) as unknown as Record<string, unknown>;
    if (String(e.$owner ?? "").toLowerCase() !== getSponsorAddress().toLowerCase()) {
      return undefined;
    }
    if (!e.$key || !e.author || e.$expiresAt == null) return undefined;
    return {
      key: String(e.$key),
      author: colVal(e.author),
      expiresAtBlock: BigInt(String(e.$expiresAt)),
    };
  } catch {
    return undefined;
  }
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
