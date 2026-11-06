import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRegistryStore } from "../lib/registry/store";
import { checkAndRecord } from "../lib/arkiv/rateLimit";

const WALLET = "0xabc12300000000000000000000000000000000de";
const NULLIFIER = "0x" + "c3".repeat(32);

// NOTE: the route module reads REGISTRY_PATH/COMMENT_RATELIMIT_PATH once at
// import time, so this file shares one temp dir (beforeAll) instead of per-test dirs.
describe("POST /api/comments", () => {
  let dir: string;
  let commentRatePath = "";

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "comments-route-test-"));
    process.env.REGISTRY_PATH = join(dir, "registry.json");
    process.env.COMMENT_RATELIMIT_PATH = join(dir, "ratelimit-comments.json");
    commentRatePath = process.env.COMMENT_RATELIMIT_PATH;
    const store = createRegistryStore(process.env.REGISTRY_PATH);
    await store.register({ nullifier: NULLIFIER, wallet: WALLET });
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.REGISTRY_PATH;
    delete process.env.COMMENT_RATELIMIT_PATH;
  });

  async function post(wallet: string | null, body: unknown) {
    const { POST } = await import("../app/api/comments/route");
    const headers = new Headers({ "content-type": "application/json" });
    if (wallet) headers.set("x-wallet", wallet);
    return POST(
      new Request("http://localhost/api/comments", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }) as never,
    );
  }

  it("rejects missing wallet with 403", async () => {
    const res = await post(null, { postKey: "k", body: "b" });
    expect(res.status).toBe(403);
  });

  it("rejects unbound wallet with 403", async () => {
    const res = await post("0xdef45600000000000000000000000000000000ab", {
      postKey: "k",
      body: "b",
    });
    expect(res.status).toBe(403);
  });

  it("returns 429 on the 6th comment", async () => {
    for (let i = 0; i < 5; i++) {
      await checkAndRecord(WALLET.toLowerCase(), { path: commentRatePath });
    }
    const res = await post(WALLET, { postKey: "k", body: "b" });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate-limited" });
  });
});
