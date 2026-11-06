import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { authMessage, issueChallenge } from "../lib/auth/challenge";
import { createRegistryStore } from "../lib/registry/store";
import { checkAndRecord } from "../lib/arkiv/rateLimit";

const WALLET = "0xabc12300000000000000000000000000000000de";
const NULLIFIER = "0x" + "c3".repeat(32);

// NOTE: the route module reads REGISTRY_PATH/RATELIMIT_PATH/NONCE_PATH once
// at import time, so this file shares one temp dir (beforeAll) instead of
// per-test dirs.
describe("POST /api/posts", () => {
  let dir: string;
  let ratePath = "";
  let noncePath = "";
  let counter = 0;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "posts-route-test-"));
    process.env.REGISTRY_PATH = join(dir, "registry.json");
    process.env.RATELIMIT_PATH = join(dir, "ratelimit.json");
    process.env.NONCE_PATH = join(dir, "nonces.json");
    ratePath = process.env.RATELIMIT_PATH;
    noncePath = process.env.NONCE_PATH;
    const store = createRegistryStore(process.env.REGISTRY_PATH);
    await store.register({ nullifier: NULLIFIER, wallet: WALLET });
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.REGISTRY_PATH;
    delete process.env.RATELIMIT_PATH;
    delete process.env.NONCE_PATH;
  });

  async function post(
    wallet: string | null,
    body: unknown,
    auth?: { nonce: string; signature: string },
  ) {
    const { POST } = await import("../app/api/posts/route");
    const headers = new Headers({ "content-type": "application/json" });
    if (wallet) headers.set("x-wallet", wallet);
    if (auth) {
      headers.set("x-auth-nonce", auth.nonce);
      headers.set("x-auth-signature", auth.signature);
    }
    return POST(
      new Request("http://localhost/api/posts", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }) as never,
    );
  }

  // Fresh wallet with a known key, registered in the store.
  async function freshWallet() {
    counter += 1;
    const account = privateKeyToAccount(`0x${counter.toString(16).padStart(64, "0")}`);
    const store = createRegistryStore(process.env.REGISTRY_PATH!);
    await store.register({
      nullifier: `0x${(0xf0 + counter).toString(16).padStart(64, "0")}`,
      wallet: account.address,
    });
    return account;
  }

  async function sign(account: { address: string; signMessage: (a: { message: string }) => Promise<`0x${string}`> }) {
    const { nonce } = await issueChallenge(account.address, { path: noncePath });
    const signature = await account.signMessage({ message: authMessage(account.address, nonce) });
    return { nonce, signature };
  }

  it("rejects missing wallet with 403", async () => {
    const res = await post(null, { title: "t", body: "b", days: 1 });
    expect(res.status).toBe(403);
  });

  it("rejects unbound wallet with 403", async () => {
    const res = await post("0xdef45600000000000000000000000000000000ab", {
      title: "t",
      body: "b",
      days: 1,
    });
    expect(res.status).toBe(403);
  });

  it("rejects bad days with 400", async () => {
    const res = await post(WALLET, { title: "t", body: "b", days: 9 });
    expect(res.status).toBe(400);
  });

  it("rejects oversize body with 400", async () => {
    const res = await post(WALLET, { title: "t", body: "x".repeat(6 * 1024), days: 1 });
    expect(res.status).toBe(400);
  });

  it("rejects a bound wallet without a signature with 403", async () => {
    const res = await post(WALLET, { title: "t", body: "b", days: 1 });
    expect(res.status).toBe(403);
  });

  it("returns 429 on the 6th post", async () => {
    const account = await freshWallet();
    for (let i = 0; i < 5; i++) {
      await checkAndRecord(account.address.toLowerCase(), { path: ratePath });
    }
    const res = await post(account.address, { title: "t", body: "b", days: 1 }, await sign(account));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate-limited" });
  });
});
