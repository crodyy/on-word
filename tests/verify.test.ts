import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { createRegistryStore } from "../lib/registry/store";
import { VerifyError, verifyProof } from "../lib/worldid/verify";

function errCode(err: unknown): string {
  return err instanceof VerifyError ? err.code : `unexpected:${String(err)}`;
}

const WALLET = "0xAbC12300000000000000000000000000000000dE";
const NULLIFIER = "0x" + "c3".repeat(32);
const ACTION = "human-forum-register-v1";

function idkitResult(signalHash: string, env = "staging") {
  return {
    protocol_version: "3.0",
    nonce: "0xabc123",
    action: ACTION,
    environment: env,
    responses: [
      {
        identifier: "orb",
        merkle_root: "0x" + "11".repeat(32),
        nullifier: NULLIFIER,
        proof: "0x1234",
        signal_hash: signalHash,
      },
    ],
  };
}

function verifyOk() {
  return {
    success: true,
    action: ACTION,
    nullifier: NULLIFIER,
    environment: "staging",
    results: [{ identifier: "orb", success: true }],
  };
}

describe("verifyProof", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "verify-test-"));
    path = join(dir, "registry.json");
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it("registers a binding on valid proof", async () => {
    const store = createRegistryStore(path);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(verifyOk()), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const wallet = WALLET.toLowerCase();
    const res = await verifyProof(
      { idkitResponse: idkitResult(hashSignal(wallet)), wallet },
      { store, expectedAction: ACTION, expectedEnv: "staging", rpId: "rp_test" },
    );
    expect(res).toEqual({ ok: true, nullifier: NULLIFIER.toLowerCase() });
    expect(await store.getBinding(wallet)).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://developer.world.org/api/v4/verify/rp_test");
    expect(JSON.parse(init.body as string).action).toBe(ACTION);
  });

  it("rejects a tampered signal without calling register", async () => {
    const store = createRegistryStore(path);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(verifyOk()), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const err = await verifyProof(
      { idkitResponse: idkitResult(hashSignal("0xothertamperedwallet000000000000000001")), wallet: WALLET },
      { store, expectedAction: ACTION, expectedEnv: "staging", rpId: "rp_test" },
    ).catch((e: unknown) => e);
    expect(errCode(err)).toBe("verify-failed");
    expect(await store.getAllowlist()).toEqual([]);
  });

  it("rejects a reused nullifier with worldid-reused", async () => {
    const store = createRegistryStore(path);
    await store.register({ nullifier: NULLIFIER, wallet: WALLET });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(verifyOk()), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const other = "0xdef45600000000000000000000000000000000ab";
    const err = await verifyProof(
      { idkitResponse: idkitResult(hashSignal(other)), wallet: other },
      { store, expectedAction: ACTION, expectedEnv: "staging", rpId: "rp_test" },
    ).catch((e: unknown) => e);
    expect(errCode(err)).toBe("worldid-reused");
  });

  it("rejects a reused wallet with wallet-reused", async () => {
    const store = createRegistryStore(path);
    await store.register({ nullifier: "0x" + "d4".repeat(32), wallet: WALLET });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ...verifyOk(),
      nullifier: "0x" + "e5".repeat(32),
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res2 = idkitResult(hashSignal(WALLET.toLowerCase()));
    res2.responses[0].nullifier = "0x" + "e5".repeat(32);
    const err = await verifyProof(
      { idkitResponse: res2, wallet: WALLET },
      { store, expectedAction: ACTION, expectedEnv: "staging", rpId: "rp_test" },
    ).catch((e: unknown) => e);
    expect(errCode(err)).toBe("wallet-reused");
  });

  it("rejects a failed verification with verify-failed", async () => {
    const store = createRegistryStore(path);
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ success: false, code: "all_verifications_failed", detail: "nope" }), { status: 400 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const err = await verifyProof(
      { idkitResponse: idkitResult(hashSignal(WALLET.toLowerCase())), wallet: WALLET },
      { store, expectedAction: ACTION, expectedEnv: "staging", rpId: "rp_test" },
    ).catch((e: unknown) => e);
    expect(errCode(err)).toBe("verify-failed");
    expect(await store.getAllowlist()).toEqual([]);
  });

  it("rejects an environment mismatch without calling the API", async () => {
    const store = createRegistryStore(path);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(verifyOk()), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const err = await verifyProof(
      { idkitResponse: idkitResult(hashSignal(WALLET.toLowerCase()), "production"), wallet: WALLET },
      { store, expectedAction: ACTION, expectedEnv: "staging", rpId: "rp_test" },
    ).catch((e: unknown) => e);
    expect(errCode(err)).toBe("verify-failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a verify response whose environment differs", async () => {
    const store = createRegistryStore(path);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ...verifyOk(), environment: "production" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const err = await verifyProof(
      { idkitResponse: idkitResult(hashSignal(WALLET.toLowerCase())), wallet: WALLET },
      { store, expectedAction: ACTION, expectedEnv: "staging", rpId: "rp_test" },
    ).catch((e: unknown) => e);
    expect(errCode(err)).toBe("verify-failed");
    expect(await store.getAllowlist()).toEqual([]);
  });

  it("rejects an action mismatch", async () => {
    const store = createRegistryStore(path);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ...verifyOk(), action: "other-action" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const err = await verifyProof(
      { idkitResponse: idkitResult(hashSignal(WALLET.toLowerCase())), wallet: WALLET },
      { store, expectedAction: ACTION, expectedEnv: "staging", rpId: "rp_test" },
    ).catch((e: unknown) => e);
    expect(errCode(err)).toBe("verify-failed");
  });
});
