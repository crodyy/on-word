import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRegistryStore } from "../lib/registry/store";

const WALLET = "0xabc12300000000000000000000000000000000de";
const NULLIFIER = "0x" + "c3".repeat(32);

// The audit's regression: a bound wallet without a valid signature must 403
// on all four write routes. Extend/edit are unreachable offline past auth
// (they read the chain), so these tests pin the pre-chain 403 gate.
describe("owner-only write routes without signature", () => {
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "manage-route-test-"));
    process.env.REGISTRY_PATH = join(dir, "registry.json");
    process.env.NONCE_PATH = join(dir, "nonces.json");
    const store = createRegistryStore(process.env.REGISTRY_PATH);
    await store.register({ nullifier: NULLIFIER, wallet: WALLET });
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.REGISTRY_PATH;
    delete process.env.NONCE_PATH;
  });

  function headers(wallet: string | null) {
    const h = new Headers({ "content-type": "application/json" });
    if (wallet) h.set("x-wallet", wallet);
    return h;
  }

  it("extend rejects a bound wallet without a signature with 403", async () => {
    const { POST } = await import("../app/api/posts/[key]/extend/route");
    const res = await POST(
      new Request("http://localhost/api/posts/0xkey/extend", {
        method: "POST",
        headers: headers(WALLET),
        body: JSON.stringify({ days: 7 }),
      }) as never,
      { params: { key: "0xkey" } } as never,
    );
    expect(res.status).toBe(403);
  });

  it("edit rejects a bound wallet without a signature with 403", async () => {
    const { POST } = await import("../app/api/posts/[key]/edit/route");
    const res = await POST(
      new Request("http://localhost/api/posts/0xkey/edit", {
        method: "POST",
        headers: headers(WALLET),
        body: JSON.stringify({ title: "new title" }),
      }) as never,
      { params: { key: "0xkey" } } as never,
    );
    expect(res.status).toBe(403);
  });
});
