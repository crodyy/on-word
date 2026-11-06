import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RegistryError, createRegistryStore } from "../lib/registry/store";

const NULLIFIER_A = "0x" + "a1".repeat(32);
const NULLIFIER_B = "0x" + "b2".repeat(32);
const WALLET_A = "0xAbC12300000000000000000000000000000000dE";
const WALLET_B = "0xDeF45600000000000000000000000000000000aB";

describe("registry store", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "registry-test-"));
    path = join(dir, "registry.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("registers a binding and reads it back", async () => {
    const store = createRegistryStore(path);
    const binding = await store.register({ nullifier: NULLIFIER_A, wallet: WALLET_A });
    expect(binding.wallet).toBe(WALLET_A.toLowerCase());
    expect(binding.nullifier).toBe(NULLIFIER_A.toLowerCase());
    expect(typeof binding.createdAt).toBe("string");
    expect(await store.getBinding(WALLET_A)).toEqual(binding);
  });

  it("rejects a reused nullifier with worldid-reused", async () => {
    const store = createRegistryStore(path);
    await store.register({ nullifier: NULLIFIER_A, wallet: WALLET_A });
    const err = await store
      .register({ nullifier: NULLIFIER_A.toUpperCase(), wallet: WALLET_B })
      .catch((e) => e);
    expect(err).toBeInstanceOf(RegistryError);
    expect(err.code).toBe("worldid-reused");
  });

  it("rejects a reused wallet with wallet-reused", async () => {
    const store = createRegistryStore(path);
    await store.register({ nullifier: NULLIFIER_A, wallet: WALLET_A });
    const err = await store
      .register({ nullifier: NULLIFIER_B, wallet: WALLET_A.toLowerCase() })
      .catch((e) => e);
    expect(err).toBeInstanceOf(RegistryError);
    expect(err.code).toBe("wallet-reused");
  });

  it("lowercases wallets and normalizes nullifiers", async () => {
    const store = createRegistryStore(path);
    await store.register({ nullifier: NULLIFIER_A.toUpperCase(), wallet: WALLET_A });
    const found = await store.getBinding(WALLET_A.toLowerCase());
    expect(found?.wallet).toBe(WALLET_A.toLowerCase());
    expect(found?.nullifier).toBe(NULLIFIER_A.toLowerCase());
  });

  it("rejects invalid wallet format", async () => {
    const store = createRegistryStore(path);
    const err = await store
      .register({ nullifier: NULLIFIER_A, wallet: "not-a-wallet" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(RegistryError);
    expect(err.code).toBe("invalid-wallet");
  });

  it("allows only one winner under concurrent duplicate registration", async () => {
    const store = createRegistryStore(path);
    const results = await Promise.allSettled([
      store.register({ nullifier: NULLIFIER_A, wallet: WALLET_A }),
      store.register({ nullifier: NULLIFIER_B, wallet: WALLET_A }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const reason = (rejected[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(RegistryError);
    expect(reason.code).toBe("wallet-reused");
  });

  it("getAllowlist returns every bound wallet", async () => {
    const store = createRegistryStore(path);
    await store.register({ nullifier: NULLIFIER_A, wallet: WALLET_A });
    await store.register({ nullifier: NULLIFIER_B, wallet: WALLET_B });
    expect(await store.getAllowlist()).toEqual(
      expect.arrayContaining([WALLET_A.toLowerCase(), WALLET_B.toLowerCase()]),
    );
  });

  it("returns undefined for unknown wallets", async () => {
    const store = createRegistryStore(path);
    expect(await store.getBinding(WALLET_A)).toBeUndefined();
  });

  it("treats an exact replay (same identity, same wallet) as idempotent", async () => {
    const store = createRegistryStore(path);
    const first = await store.register({ nullifier: NULLIFIER_A, wallet: WALLET_A });
    const second = await store.register({
      nullifier: NULLIFIER_A.toUpperCase(),
      wallet: WALLET_A.toLowerCase(),
    });
    expect(second).toEqual(first);
    expect(await store.getAllowlist()).toHaveLength(1);
  });
});
