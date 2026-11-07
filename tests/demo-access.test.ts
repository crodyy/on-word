import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import {
  assertWriteAuth,
  authMessage,
  ChallengeError,
  issueChallenge,
} from "../lib/auth/challenge";

// TEMP-DEMO (T-035): open access skips the registry binding but still
// requires proof of key ownership. Remove with the flag.
describe("demo open access", () => {
  let dir: string;
  let noncePath = "";

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "demo-access-test-"));
    noncePath = join(dir, "nonces.json");
    process.env.DEMO_OPEN_ACCESS = "true";
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.DEMO_OPEN_ACCESS;
  });

  const noBinding = async () => undefined;

  async function signedHeaders(seed: string) {
    const account = privateKeyToAccount(`0x${seed.repeat(32)}`);
    const { nonce } = await issueChallenge(account.address, { path: noncePath });
    const signature = await account.signMessage({
      message: authMessage(account.address, nonce),
    });
    return { account, nonce, signature };
  }

  it("allows a signed wallet with no registry binding", async () => {
    const { account, nonce, signature } = await signedHeaders("c9");
    await expect(
      assertWriteAuth(
        { wallet: account.address, nonce, signature },
        { getBinding: noBinding, noncePath },
      ),
    ).resolves.toBe(account.address.toLowerCase());
  });

  it("still rejects a bad signature", async () => {
    const { account, nonce } = await signedHeaders("d1");
    await expect(
      assertWriteAuth(
        { wallet: account.address, nonce, signature: "0xdead" },
        { getBinding: noBinding, noncePath },
      ),
    ).rejects.toBeInstanceOf(ChallengeError);
  });

  it("still rejects a malformed wallet", async () => {
    const { nonce } = await signedHeaders("e2");
    await expect(
      assertWriteAuth(
        { wallet: "not-a-wallet", nonce, signature: "0xdead" },
        { getBinding: noBinding, noncePath },
      ),
    ).rejects.toBeInstanceOf(ChallengeError);
  });
});
