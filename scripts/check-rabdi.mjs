// T-002 acceptance check. Run: node --env-file=.env.local scripts/check-rabdi.mjs
// Prints only non-secret data: chain id, block number, sponsor address, balance.
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" });
const publicClient = createPublicClient({ chain, transport: http() });

const timing = await publicClient.getBlockTiming();
console.log("chainId:", chain.id);
console.log("block:", timing.currentBlock.toString());

let key = process.env.SPONSOR_PRIVATE_KEY;
if (!key) {
  console.log("SPONSOR_PRIVATE_KEY: missing");
  process.exit(2);
}
if (!key.startsWith("0x")) key = `0x${key}`;
const account = privateKeyToAccount(key);
const balance = await publicClient.getBalance({ address: account.address });
console.log("sponsor:", account.address);
console.log("balance tGLM:", formatEther(balance));
if (balance === 0n) {
  console.log("FUNDING REQUIRED: send tGLM from https://hub.arkiv.network/faucet");
  process.exit(3);
}
