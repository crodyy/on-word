import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkAndRecord, RateLimitedError, releaseSlot } from "../lib/arkiv/rateLimit";

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

  it("allows 5 posts then rejects the 6th", async () => {
    for (let i = 0; i < 5; i++) {
      await checkAndRecord("0xAbC12300000000000000000000000000000000dE", { path, now: 1000 + i });
    }
    const err = await checkAndRecord("0xAbC12300000000000000000000000000000000dE", {
      path,
      now: 2000,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitedError);
  });

  it("serializes concurrent hits so only 5 win", async () => {
    const wallet = "0xAbC12300000000000000000000000000000000dE";
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => checkAndRecord(wallet, { path, now: 1000 + i })),
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(5);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(RateLimitedError);
  });

  it("releaseSlot frees one hit so a failed write does not burn quota", async () => {
    const wallet = "0xAbC12300000000000000000000000000000000dE";
    for (let i = 0; i < 5; i++) {
      await checkAndRecord(wallet, { path, now: 1000 + i });
    }
    await releaseSlot(wallet, { path });
    await checkAndRecord(wallet, { path, now: 2000 });
  });
});
