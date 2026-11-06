import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Chain id 7794095, 2s blocks, tGLM gas. Access key goes into the RPC URL;
// empty string falls back to the public RPC with a warning.
export const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" });

export const publicClient = createPublicClient({ chain, transport: http() });

export function getSponsorAccount() {
  let key = process.env.SPONSOR_PRIVATE_KEY as string | undefined;
  if (!key) throw new Error("SPONSOR_PRIVATE_KEY is not set");
  if (!key.startsWith("0x")) key = `0x${key}`;
  return privateKeyToAccount(key as Hex);
}

export function getSponsorAddress(): Hex {
  return getSponsorAccount().address;
}

export function getWalletClient() {
  return createWalletClient({ chain, transport: http(), account: getSponsorAccount() });
}
