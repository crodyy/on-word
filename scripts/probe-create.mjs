// T-007 acceptance probe. Run: node --env-file=.env.local scripts/probe-create.mjs
// Creates one clearly-marked 1-day test entity from an UNREGISTERED wallet,
// so it can never appear in the allowlisted feed. Prints entityKey, expiresAt, txHash.
// Costs a small amount of sponsor tGLM.
// NOTE: mirrors lib/arkiv/posts.ts (the canonical path used by routes) but in
// plain .mjs, because node cannot resolve the extensionless TS imports.
import { randomBytes } from "node:crypto";
import { ExpirationTime, createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { addr, bytes, defineSchema, str } from "@arkiv-network/sdk/schema";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

let sponsorKey = process.env.SPONSOR_PRIVATE_KEY;
if (!sponsorKey) throw new Error("SPONSOR_PRIVATE_KEY is not set");
if (!sponsorKey.startsWith("0x")) sponsorKey = `0x${sponsorKey}`;

const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" });
const account = privateKeyToAccount(sponsorKey);
const walletClient = createWalletClient({ chain, transport: http(), account });
const publicClient = createPublicClient({ chain, transport: http() });

const Posts = defineSchema("human-forum.posts.v1", {
  author: addr().indexed(),
  postKey: str().indexed(),
  title: str(),
  body: bytes(),
});

const probeWallet = "0x00000000000000000000000000000000deadbeef";
const postKey = `probe-${Date.now()}-${randomBytes(4).toString("hex")}`;
const bodyBytes = new TextEncoder().encode("T-007 Rabdi write-path probe. Not a real post.");

const { entityKey, expiresAt, txHash } = await walletClient.createEntity(
  Posts,
  {
    author: addr(probeWallet),
    postKey,
    title: "[probe] connectivity check, ignore",
    body: bodyBytes,
  },
  { expiration: ExpirationTime.fromDays(1) },
);
console.log("entityKey:", entityKey);
console.log("expiresAt:", expiresAt.toString());
console.log("txHash:", txHash);
console.log(`https://rabdi.explorer.arkiv.network/tx/${txHash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
console.log("status:", receipt.status);
