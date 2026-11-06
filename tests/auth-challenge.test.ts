import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import {
  ChallengeError,
  authMessage,
  consumeChallenge,
  issueChallenge,
  verifyWalletSignature,
} from "../lib/auth/challenge";

const ACCOUNT = privateKeyToAccount(`0x${"ab".repeat(32)}`);
const WALLET = ACCOUNT.address;

describe("auth challenge", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "challenge-test-"));
    path = join(dir, "nonces.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("issues a nonce the wallet can sign and the server accepts once", async () => {
    const { nonce, expiresAt } = await issueChallenge(WALLET, { path });
    expect(typeof nonce).toBe("string");
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
    const signature = await ACCOUNT.signMessage({ message: authMessage(WALLET, nonce) });
    await expect(verifyWalletSignature({ wallet: WALLET, nonce, signature })).resolves.toBeUndefined();
    await expect(consumeChallenge(WALLET, nonce, { path })).resolves.toBeUndefined();
    // Replay of the same nonce fails.
    await expect(consumeChallenge(WALLET, nonce, { path })).rejects.toBeInstanceOf(ChallengeError);
  });

  it("rejects a signature from a different wallet", async () => {
    const { nonce } = await issueChallenge(WALLET, { path });
    const other = privateKeyToAccount(`0x${"cd".repeat(32)}`);
    const signature = await other.signMessage({ message: authMessage(WALLET, nonce) });
    await expect(
      verifyWalletSignature({ wallet: WALLET, nonce, signature }),
    ).rejects.toBeInstanceOf(ChallengeError);
  });

  it("rejects an expired nonce", async () => {
    const issued = await issueChallenge(WALLET, { path, now: 1000 });
    await expect(consumeChallenge(WALLET, issued.nonce, { path })).rejects.toBeInstanceOf(ChallengeError);
  });

  it("rejects a nonce issued for another wallet", async () => {
    const { nonce } = await issueChallenge(WALLET, { path });
    const other = "0xdef45600000000000000000000000000000000ab";
    await expect(consumeChallenge(other, nonce, { path })).rejects.toBeInstanceOf(ChallengeError);
  });
});

describe("assertWriteAuth", () => {
  const getBinding = async (wallet: string) =>
    wallet.toLowerCase() === WALLET.toLowerCase() ? { wallet: WALLET.toLowerCase() } : undefined;

  async function signedHeaders(wallet: string, noncePath: string) {
    const { nonce } = await issueChallenge(wallet, { path: noncePath });
    const signature = await ACCOUNT.signMessage({ message: authMessage(wallet, nonce) });
    return { wallet, nonce, signature };
  }

  it("accepts a bound wallet with a fresh signature", async () => {
    const dir = mkdtempSync(join(tmpdir(), "writeauth-test-"));
    try {
      const noncePath = join(dir, "nonces.json");
      const headers = await signedHeaders(WALLET, noncePath);
      const { assertWriteAuth } = await import("../lib/auth/challenge");
      await expect(assertWriteAuth(headers, { getBinding, noncePath })).resolves.toBe(
        WALLET.toLowerCase(),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a bound wallet with no signature headers", async () => {
    const { assertWriteAuth } = await import("../lib/auth/challenge");
    await expect(
      assertWriteAuth({ wallet: WALLET, nonce: null, signature: null }, { getBinding, noncePath: "x" }),
    ).rejects.toBeInstanceOf(ChallengeError);
  });

  it("rejects an unbound wallet even with a valid signature", async () => {
    const dir = mkdtempSync(join(tmpdir(), "writeauth-test-"));
    try {
      const noncePath = join(dir, "nonces.json");
      const other = privateKeyToAccount(`0x${"cd".repeat(32)}`);
      const { nonce } = await issueChallenge(other.address, { path: noncePath });
      const signature = await other.signMessage({
        message: authMessage(other.address, nonce),
      });
      const { assertWriteAuth } = await import("../lib/auth/challenge");
      await expect(
        assertWriteAuth(
          { wallet: other.address, nonce, signature },
          { getBinding, noncePath },
        ),
      ).rejects.toBeInstanceOf(ChallengeError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a replayed signature", async () => {
    const dir = mkdtempSync(join(tmpdir(), "writeauth-test-"));
    try {
      const noncePath = join(dir, "nonces.json");
      const headers = await signedHeaders(WALLET, noncePath);
      const { assertWriteAuth } = await import("../lib/auth/challenge");
      await assertWriteAuth(headers, { getBinding, noncePath });
      await expect(assertWriteAuth(headers, { getBinding, noncePath })).rejects.toBeInstanceOf(
        ChallengeError,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
