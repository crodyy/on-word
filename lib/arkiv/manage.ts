import { ExpirationTime } from "@arkiv-network/sdk";
import type { Hex } from "viem";
import { getWalletClient, publicClient } from "./client";
import { getDefaultStore } from "../registry/store";
import { Posts } from "./schemas";
import type { PostLifetime, PostLifetimeHours } from "./posts";

export interface ManagedPost {
  key: string;
  author: string;
  expiresAtBlock: bigint;
}

function colVal(v: unknown): string {
  if (v !== null && typeof v === "object" && "value" in v) return String((v as { value: unknown }).value);
  return String(v);
}

// Returns undefined when the key does not exist or is not our schema.
export async function fetchManagedPost(entityKey: string): Promise<ManagedPost | undefined> {
  try {
    const e = (await publicClient.getEntity(entityKey as Hex, Posts)) as unknown as Record<string, unknown>;
    return {
      key: String(e.$key),
      author: colVal(e.author),
      expiresAtBlock: BigInt(String(e.$expiresAt)),
    };
  } catch {
    return undefined;
  }
}

// Owner-only: caller wallet must equal the stored author AND hold a binding.
export async function assertOwner(post: ManagedPost, wallet: string): Promise<void> {
  const lower = wallet.toLowerCase();
  if (post.author.toLowerCase() !== lower) throw new Error("not-owner");
  const binding = await getDefaultStore().getBinding(wallet).catch(() => undefined);
  if (!binding) throw new Error("not-owner");
}

export async function extendPostEntity(
  entityKey: string,
  lifetime: PostLifetime | { hours: PostLifetimeHours },
): Promise<{ expiresAt: string }> {
  const client = getWalletClient();
  const isHours = typeof lifetime === "object";
  const expiration = isHours
    ? ExpirationTime.fromHours(lifetime.hours)
    : ExpirationTime.fromDays(lifetime);
  await client.extendEntity({ entityKey: entityKey as Hex, expiration });
  const ms = isHours ? lifetime.hours * 3600 * 1000 : (lifetime as PostLifetime) * 24 * 3600 * 1000;
  return { expiresAt: new Date(Date.now() + ms).toISOString() };
}

export async function editPostEntity(
  entityKey: string,
  changes: { title?: string; body?: string },
): Promise<void> {
  const set: { title?: string; body?: Uint8Array } = {};
  if (changes.title !== undefined) set.title = changes.title;
  if (changes.body !== undefined) set.body = new TextEncoder().encode(changes.body);
  const client = getWalletClient();
  await client.patchEntity(Posts, entityKey as Hex, { set });
}
