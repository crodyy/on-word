import { ExpirationTime } from "@arkiv-network/sdk";
import { addr } from "@arkiv-network/sdk/schema";
import type { Hex } from "viem";
import { getWalletClient } from "./client";
import { Posts } from "./schemas";

export const POST_LIFETIME_DAYS = [1, 3, 5] as const;
export type PostLifetime = (typeof POST_LIFETIME_DAYS)[number];

export const POST_LIFETIME_HOURS = [1] as const;
export type PostLifetimeHours = (typeof POST_LIFETIME_HOURS)[number];

export const MAX_TITLE_BYTES = 128;
export const MAX_BODY_BYTES = 5 * 1024;

export function assertPostLifetime(days: number): asserts days is PostLifetime {
  if (!POST_LIFETIME_DAYS.includes(days as PostLifetime)) {
    throw new Error(`days must be one of ${POST_LIFETIME_DAYS.join(",")}`);
  }
}

export function assertPostLifetimeHours(hours: number): asserts hours is PostLifetimeHours {
  if (!POST_LIFETIME_HOURS.includes(hours as PostLifetimeHours)) {
    throw new Error(`hours must be one of ${POST_LIFETIME_HOURS.join(",")}`);
  }
}

export interface PostDraft {
  title: string;
  body: string;
  days?: number;
  hours?: number;
}

export function validatePostInput(draft: PostDraft): asserts draft is PostDraft & ({ days: PostLifetime } | { hours: PostLifetimeHours }) {
  if (draft.hours !== undefined) {
    if (draft.days !== undefined) throw new Error("pass either days or hours, not both");
    assertPostLifetimeHours(draft.hours);
  } else {
    assertPostLifetime(draft.days as number);
  }
  if (Buffer.byteLength(draft.title, "utf8") > MAX_TITLE_BYTES) {
    throw new Error("title over 128 bytes");
  }
  if (new TextEncoder().encode(draft.body).length > MAX_BODY_BYTES) {
    throw new Error("body over 5KB");
  }
}

export interface CreatePostInput extends PostDraft {
  authorWallet: Hex;
  postKey: string;
}

export interface CreatePostResult {
  entityKey: Hex;
  expiresAt: bigint;
  txHash: Hex;
}

export async function createPostEntity(input: CreatePostInput): Promise<CreatePostResult> {
  validatePostInput(input);
  const bodyBytes = new TextEncoder().encode(input.body);
  const client = getWalletClient();
  const { entityKey, expiresAt, txHash } = await client.createEntity(
    Posts,
    {
      author: addr(input.authorWallet),
      postKey: input.postKey,
      title: input.title,
      body: bodyBytes,
    },
    { expiration: input.hours !== undefined ? ExpirationTime.fromHours(input.hours) : ExpirationTime.fromDays(input.days as PostLifetime) },
  );
  return { entityKey, expiresAt, txHash };
}
