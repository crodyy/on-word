import { ExpirationTime } from "@arkiv-network/sdk";
import { addr } from "@arkiv-network/sdk/schema";
import type { Hex } from "viem";
import { getWalletClient } from "./client";
import { Posts } from "./schemas";

export const POST_LIFETIME_DAYS = [1, 7, 30] as const;
export type PostLifetime = (typeof POST_LIFETIME_DAYS)[number];

export const MAX_TITLE_BYTES = 128;
export const MAX_BODY_BYTES = 5 * 1024;

export function assertPostLifetime(days: number): asserts days is PostLifetime {
  if (!POST_LIFETIME_DAYS.includes(days as PostLifetime)) {
    throw new Error(`days must be one of ${POST_LIFETIME_DAYS.join(",")}`);
  }
}

export interface CreatePostInput {
  authorWallet: Hex;
  postKey: string;
  title: string;
  body: string;
  days: PostLifetime;
}

export interface CreatePostResult {
  entityKey: Hex;
  expiresAt: bigint;
  txHash: Hex;
}

export async function createPostEntity(input: CreatePostInput): Promise<CreatePostResult> {
  assertPostLifetime(input.days);
  if (Buffer.byteLength(input.title, "utf8") > MAX_TITLE_BYTES) {
    throw new Error("title over 128 bytes");
  }
  const bodyBytes = new TextEncoder().encode(input.body);
  if (bodyBytes.length > MAX_BODY_BYTES) {
    throw new Error("body over 5KB");
  }
  const client = getWalletClient();
  const { entityKey, expiresAt, txHash } = await client.createEntity(
    Posts,
    {
      author: addr(input.authorWallet),
      postKey: input.postKey,
      title: input.title,
      body: bodyBytes,
    },
    { expiration: ExpirationTime.fromDays(input.days) },
  );
  return { entityKey, expiresAt, txHash };
}
