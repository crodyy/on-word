import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkAndRecord, RateLimitedError } from "../lib/arkiv/rateLimit";
import { MAX_BODY_BYTES, MAX_TITLE_BYTES, validatePostInput } from "../lib/arkiv/posts";

describe("rate limit", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ratelimit-test-"));
    path = join(dir, "ratelimit.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("allows 5 posts then rejects the 6th with 429 semantics", async () => {
    for (let i = 0; i < 5; i++) {
      await checkAndRecord("0xabc12300000000000000000000000000000000de", { path });
    }
    const err = await checkAndRecord("0xabc12300000000000000000000000000000000de", { path }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(RateLimitedError);
  });

  it("isolates wallets from each other", async () => {
    for (let i = 0; i < 5; i++) {
      await checkAndRecord("0xabc12300000000000000000000000000000000de", { path });
    }
    await checkAndRecord("0xdef45600000000000000000000000000000000ab", { path });
  });

  it("resets the window after 24h", async () => {
    const wallet = "0xabc12300000000000000000000000000000000de";
    for (let i = 0; i < 5; i++) {
      await checkAndRecord(wallet, { path, now: 1_000 });
    }
    await checkAndRecord(wallet, { path, now: 1_000 + 24 * 3600 * 1000 + 1 });
  });
});

describe("post validation", () => {
  it("rejects bad days, oversize title, oversize body", () => {
    expect(() => validatePostInput({ title: "t", body: "b", days: 9 })).toThrow();
    expect(() => validatePostInput({ title: "x".repeat(MAX_TITLE_BYTES + 1), body: "b", days: 1 })).toThrow();
    expect(() =>
      validatePostInput({ title: "t", body: "x".repeat(MAX_BODY_BYTES + 1), days: 3 }),
    ).toThrow();
    expect(() => validatePostInput({ title: "t", body: "b", days: 5 })).not.toThrow();
  });

  it("accepts a 1-hour lifetime and rejects bad hours or days+hours together", () => {
    expect(() => validatePostInput({ title: "t", body: "b", hours: 1 })).not.toThrow();
    expect(() => validatePostInput({ title: "t", body: "b", hours: 2 })).toThrow();
    expect(() => validatePostInput({ title: "t", body: "b", days: 1, hours: 1 })).toThrow();
    expect(() => validatePostInput({ title: "t", body: "b" })).toThrow();
  });
});
