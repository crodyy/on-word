// T-010 acceptance probe. Run: node --env-file=.env.local scripts/probe-comment.mjs [postKey]
// Creates one clearly-marked comment with fixed 7-day expiry on the given post.
// Costs a small amount of sponsor tGLM.
import { ExpirationTime, createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { addr, bytes, defineSchema, str } from "@arkiv-network/sdk/schema";
import { eq } from "@arkiv-network/sdk/query";
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
const Comments = defineSchema("human-forum.comments.v1", {
  postKey: str().indexed(),
  author: addr().indexed(),
  body: bytes(),
});

const postKey = process.argv[2] ?? "probe-1793952446695-a29f540b";
const probeWallet = "0x00000000000000000000000000000000deadbeef";

const parents = await publicClient
  .select({ $key: true, $expiresAt: true })
  .from(Posts)
  .ownedBy(account.address)
  .where(eq("postKey", postKey))
  .limit(1)
  .fetch();
if (parents.entities.length === 0) throw new Error(`parent not found: ${postKey}`);
const timing = await publicClient.getBlockTiming();
console.log("parent expiresAt:", String(parents.entities[0].$expiresAt), "current:", timing.currentBlock.toString());

const bodyBytes = new TextEncoder().encode("T-010 comment probe. Not a real comment.");
const { entityKey, expiresAt, txHash } = await walletClient.createEntity(
  Comments,
  { postKey, author: addr(probeWallet), body: bodyBytes },
  { expiration: ExpirationTime.fromDays(7) },
);
console.log("entityKey:", entityKey);
console.log("expiresAt:", expiresAt.toString(), "deltaBlocks:", (expiresAt - timing.currentBlock).toString());
console.log("txHash:", txHash);
console.log(`https://rabdi.explorer.arkiv.network/tx/${txHash}`);

const n = await publicClient.count().from(Comments).where(eq("postKey", postKey)).fetch();
console.log("comments on parent now:", n.toString());
