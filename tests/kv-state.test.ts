import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import {
  resetKvOverride,
  setKvOverride,
  type KvLike,
} from "../lib/store/kv";
import { createRegistryStore, RegistryError } from "../lib/registry/store";
import {
  ChallengeError,
  authMessage,
  consumeChallenge,
  issueChallenge,
} from "../lib/auth/challenge";
import { RateLimitedError, checkAndRecord, releaseSlot } from "../lib/arkiv/rateLimit";
import { emptyCache, loadCache, saveCache } from "../lib/arkiv/feed";

// In-memory stand-in for the Redis adapter in lib/store/kv.ts. It honors
// the same contract (atomic compare-del, TTL expiry, rate windows) so the
// flow logic in each module is tested without network access.
class FakeKv implements KvLike {
  strings = new Map<string, { value: string; expiresAt: number }>();
  hashes = new Map<string, Map<string, string>>();
  private zsets = new Map<string, { score: number; member: string }[]>();

  async get(key: string): Promise<string | null> {
    const e = this.strings.get(key);
    if (!e) return null;
    if (e.expiresAt <= Date.now()) {
      this.strings.delete(key);
      return null;
    }
    return e.value;
  }

  async set(key: string, value: string, opts?: { ex?: number }): Promise<void> {
    this.strings.set(key, {
      value,
      expiresAt: Date.now() + (opts?.ex ?? 3600) * 1000,
    });
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) {
      if (this.strings.delete(k)) n += 1;
    }
    return n;
  }

  async hsetnx(key: string, field: string, value: string): Promise<number> {
    let h = this.hashes.get(key);
    if (!h) {
      h = new Map();
      this.hashes.set(key, h);
    }
    if (h.has(field)) return 0;
    h.set(field, value);
    return 1;
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.hashes.get(key)?.get(field) ?? null;
  }

  async hkeys(key: string): Promise<string[]> {
    return Array.from(this.hashes.get(key)?.keys() ?? []);
  }

  async compareDel(key: string, expected: string): Promise<number> {
    const current = await this.get(key);
    if (current === null || current !== expected) return 0;
    this.strings.delete(key);
    return 1;
  }

  async rateHit(key: string, now: number, windowMs: number, limit: number): Promise<number> {
    const cutoff = now - windowMs;
    const kept = (this.zsets.get(key) ?? []).filter((e) => e.score > cutoff);
    if (kept.length >= limit) {
      this.zsets.set(key, kept);
      return -1;
    }
    kept.push({ score: now, member: `${now}-${kept.length}` });
    this.zsets.set(key, kept);
    return kept.length;
  }

  async rateRelease(key: string, now: number, windowMs: number): Promise<void> {
    const cutoff = now - windowMs;
    const kept = (this.zsets.get(key) ?? []).filter((e) => e.score > cutoff);
    kept.pop();
    this.zsets.set(key, kept);
  }

  forceExpire(key: string): void {
    const e = this.strings.get(key);
    if (e) e.expiresAt = 0;
  }
}

const NULLIFIER_A = "0x" + "a1".repeat(32);
const NULLIFIER_B = "0x" + "b2".repeat(32);
const WALLET_A = "0xAbC12300000000000000000000000000000000dE";
const WALLET_B = "0xDeF45600000000000000000000000000000000aB";
const ACCOUNT = privateKeyToAccount(`0x${"ab".repeat(32)}`);
const SIGN_WALLET = ACCOUNT.address;

let fake: FakeKv;

beforeEach(() => {
  fake = new FakeKv();
  setKvOverride(fake);
});

afterEach(() => {
  resetKvOverride();
});

describe("kv-backed registry", () => {
  it("registers and reads back a binding across store instances", async () => {
    await createRegistryStore("/ignored/registry.json").register({
      nullifier: NULLIFIER_A,
      wallet: WALLET_A,
    });
    // A second instance (a different serverless invocation) sees it.
    const found = await createRegistryStore("/ignored/registry.json").getBinding(WALLET_A);
    expect(found?.wallet).toBe(WALLET_A.toLowerCase());
    expect(found?.nullifier).toBe(NULLIFIER_A.toLowerCase());
  });

  it("rejects a reused nullifier with worldid-reused", async () => {
    const store = createRegistryStore("/ignored/registry.json");
    await store.register({ nullifier: NULLIFIER_A, wallet: WALLET_A });
    const err = await store
      .register({ nullifier: NULLIFIER_A, wallet: WALLET_B })
      .catch((e) => e);
    expect(err).toBeInstanceOf(RegistryError);
    expect(err.code).toBe("worldid-reused");
  });

  it("rejects a reused wallet with wallet-reused", async () => {
    const store = createRegistryStore("/ignored/registry.json");
    await store.register({ nullifier: NULLIFIER_A, wallet: WALLET_A });
    const err = await store
      .register({ nullifier: NULLIFIER_B, wallet: WALLET_A })
      .catch((e) => e);
    expect(err).toBeInstanceOf(RegistryError);
    expect(err.code).toBe("wallet-reused");
  });

  it("lists every bound wallet in the allowlist", async () => {
    const store = createRegistryStore("/ignored/registry.json");
    await store.register({ nullifier: NULLIFIER_A, wallet: WALLET_A });
    await store.register({ nullifier: NULLIFIER_B, wallet: WALLET_B });
    const allowlist = await createRegistryStore("/ignored/registry.json").getAllowlist();
    expect(allowlist.sort()).toEqual(
      [WALLET_A.toLowerCase(), WALLET_B.toLowerCase()].sort(),
    );
  });
});

describe("kv-backed nonces", () => {
  const PATH = "/ignored/nonces.json";

  it("issues a nonce the wallet can sign and the server accepts once", async () => {
    const { nonce, expiresAt } = await issueChallenge(SIGN_WALLET, { path: PATH });
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
    const signature = await ACCOUNT.signMessage({
      message: authMessage(SIGN_WALLET, nonce),
    });
    const { verifyWalletSignature } = await import("../lib/auth/challenge");
    await expect(
      verifyWalletSignature({ wallet: SIGN_WALLET, nonce, signature }),
    ).resolves.toBeUndefined();
    await expect(consumeChallenge(SIGN_WALLET, nonce, { path: PATH })).resolves.toBeUndefined();
    await expect(consumeChallenge(SIGN_WALLET, nonce, { path: PATH })).rejects.toBeInstanceOf(
      ChallengeError,
    );
  });

  it("rejects a nonce issued for a different wallet", async () => {
    const { nonce } = await issueChallenge(SIGN_WALLET, { path: PATH });
    await expect(consumeChallenge(WALLET_A, nonce, { path: PATH })).rejects.toBeInstanceOf(
      ChallengeError,
    );
  });

  it("rejects an expired nonce", async () => {
    const { nonce } = await issueChallenge(SIGN_WALLET, { path: PATH });
    fake.forceExpire(`onword:nonce:${SIGN_WALLET.toLowerCase()}`);
    await expect(consumeChallenge(SIGN_WALLET, nonce, { path: PATH })).rejects.toBeInstanceOf(
      ChallengeError,
    );
  });
});

describe("kv-backed rate limit", () => {
  const PATH = "/ignored/ratelimit.json";

  it("allows five posts then rejects the sixth", async () => {
    for (let i = 0; i < 5; i += 1) {
      await expect(checkAndRecord(WALLET_A, { path: PATH })).resolves.toBeUndefined();
    }
    await expect(checkAndRecord(WALLET_A, { path: PATH })).rejects.toBeInstanceOf(
      RateLimitedError,
    );
  });

  it("isolates wallets and frees a slot on release", async () => {
    for (let i = 0; i < 5; i += 1) {
      await checkAndRecord(WALLET_A, { path: PATH });
    }
    await expect(checkAndRecord(WALLET_B, { path: PATH })).resolves.toBeUndefined();
    await releaseSlot(WALLET_A, { path: PATH });
    await expect(checkAndRecord(WALLET_A, { path: PATH })).resolves.toBeUndefined();
  });
});

describe("kv-backed feed cache", () => {
  const PATH = "/ignored/cache.json";

  it("round-trips the cache across instances", async () => {
    const cache = emptyCache();
    cache.posts.push({
      key: "0xabc",
      title: "Hello",
      excerpt: "Hello world",
      owner: WALLET_A.toLowerCase(),
      postKey: "1-deadbeef",
      expiresAtBlock: "12345",
    });
    await saveCache(PATH, cache);
    const loaded = await loadCache("/ignored/other-dir/cache.json");
    expect(loaded.posts).toHaveLength(1);
    expect(loaded.posts[0]?.title).toBe("Hello");
  });

  it("returns an empty cache when nothing was stored", async () => {
    await expect(loadCache(PATH)).resolves.toEqual(emptyCache());
  });
});
