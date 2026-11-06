// Read-only probe: validate the feed query shape against Rabdi.
// Run: node --env-file=.env.local scripts/probe-feed.mjs
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { addr, bytes, defineSchema, str } from "@arkiv-network/sdk/schema";
import { desc, eq } from "@arkiv-network/sdk/query";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

let sponsorKey = process.env.SPONSOR_PRIVATE_KEY;
if (!sponsorKey) throw new Error("SPONSOR_PRIVATE_KEY is not set");
if (!sponsorKey.startsWith("0x")) sponsorKey = `0x${sponsorKey}`;

const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" });
const publicClient = createPublicClient({ chain, transport: http() });
const sponsor = privateKeyToAccount(sponsorKey).address;

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

const page = await publicClient
  .select({ $key: true, $owner: true, $expiresAt: true, author: true, postKey: true, title: true })
  .from(Posts)
  .ownedBy(sponsor)
  .orderBy(desc("postKey"))
  .limit(100)
  .fetch();

console.log("total:", page.total?.toString() ?? "(no total)");
console.log("rows:", page.entities.length);
for (const e of page.entities.slice(0, 5)) {
  console.log(JSON.stringify(e, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
}

if (page.entities.length > 0) {
  const first = page.entities[0];
  const postKey = first.postKey?.value ?? first.postKey;
  const n = await publicClient.count().from(Comments).where(eq("postKey", postKey)).fetch();
  console.log("comments on first:", n.toString());
}
