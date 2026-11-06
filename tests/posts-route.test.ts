import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRegistryStore } from "../lib/registry/store";
import { checkAndRecord } from "../lib/arkiv/rateLimit";

const WALLET = "0xabc12300000000000000000000000000000000de";
const NULLIFIER = "0x" + "c3".repeat(32);

// NOTE: the route module reads REGISTRY_PATH/RATELIMIT_PATH once at import
// time, so this file shares one temp dir (beforeAll) instead of per-test dirs.
describe("POST /api/posts", () => {
  let dir: string;
  let ratePath = "";

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "posts-route-test-"));
    process.env.REGISTRY_PATH = join(dir, "registry.json");
    process.env.RATELIMIT_PATH = join(dir, "ratelimit.json");
    ratePath = process.env.RATELIMIT_PATH;
    const store = createRegistryStore(process.env.REGISTRY_PATH);
    await store.register({ nullifier: NULLIFIER, wallet: WALLET });
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.REGISTRY_PATH;
    delete process.env.RATELIMIT_PATH;
  });

  async function post(wallet: string | null, body: unknown) {
    const { POST } = await import("../app/api/posts/route");
    const headers = new Headers({ "content-type": "application/json" });
    if (wallet) headers.set("x-wallet", wallet);
    return POST(
      new Request("http://localhost/api/posts", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }) as never,
    );
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

  it("returns 429 on the 6th post", async () => {
    for (let i = 0; i < 5; i++) {
      await checkAndRecord(WALLET.toLowerCase(), { path: ratePath });
    }
    const res = await post(WALLET, { title: "t", body: "b", days: 1 });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate-limited" });
  });
});
