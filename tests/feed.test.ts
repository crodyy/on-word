import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decodeBodyCell,
  emptyCache,
  loadCache,
  saveCache,
  splitFeed,
  upsertCache,
  type ChainPost,
} from "../lib/arkiv/feed";

const CURRENT = BigInt(1000000);

function post(over: Partial<ChainPost> = {}): ChainPost {
  return {
    key: "0xkey1",
    owner: "0xSponsor",
    author: "0xAuthor",
    postKey: "probe-1",
    title: "hello",
    expiresAtBlock: CURRENT + BigInt(43200),
    ...over,
  };
}

describe("feed split", () => {
  it("shows allowlisted unexpired posts as live, newest first", () => {
    const live = [post(), post({ key: "0xkey2", postKey: "probe-2" })];
    const { posts, archived } = splitFeed(
      live,
      new Set(["0xauthor"]),
      CURRENT,
      new Map([["0xkey1", 3]]),
      emptyCache(),
    );
    expect(posts).toHaveLength(2);
    expect(posts[0].commentCount).toBe(3);
    expect(posts[0].expired).toBe(false);
    expect(archived).toEqual([]);
  });

  it("hides unbound-author spoof entities", () => {
    const { posts } = splitFeed(
      [post({ author: "0xUnboundSpoof" })],
      new Set(["0xauthor"]),
      CURRENT,
      new Map(),
      emptyCache(),
    );
    expect(posts).toEqual([]);
  });

  it("archives cached posts past expiry instead of dropping them", () => {
    const cache = upsertCache(emptyCache(), [post()]);
    const { posts, archived } = splitFeed([], new Set(["0xauthor"]), CURRENT + BigInt(43201), new Map(), cache);
    expect(posts).toEqual([]);
    expect(archived).toHaveLength(1);
    expect(archived[0].expired).toBe(true);
  });

  it("does not archive cached posts still within lifetime", () => {
    const cache = upsertCache(emptyCache(), [post()]);
    const { archived } = splitFeed([], new Set(["0xauthor"]), CURRENT, new Map(), cache);
    expect(archived).toEqual([]);
  });

  it("round-trips the cache file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cache-test-"));
    try {
      const path = join(dir, "cache.json");
      expect(await loadCache(path)).toEqual(emptyCache());
      await saveCache(path, upsertCache(emptyCache(), [post()]));
      const back = await loadCache(path);
      expect(back.posts).toHaveLength(1);
      expect(back.posts[0].key).toBe("0xkey1");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("migrates a stale version-1 cache file to empty", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cache-test-"));
    try {
      const path = join(dir, "cache.json");
      const { writeFile } = await import("node:fs/promises");
      await writeFile(
        path,
        JSON.stringify({ version: 1, posts: [{ key: "0xold", title: "old", owner: "0xSponsor", postKey: "p", expiresAtBlock: "1" }] }),
        "utf8",
      );
      expect(await loadCache(path)).toEqual(emptyCache());
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("decodeBodyCell", () => {
  it("decodes 0x hex bytes cells", () => {
    const hex = `0x${Buffer.from("hello post", "utf8").toString("hex")}`;
    expect(decodeBodyCell({ value: hex })).toBe("hello post");
  });

  it("passes plain strings through", () => {
    expect(decodeBodyCell({ value: "already text" })).toBe("already text");
  });

  it("decodes raw byte arrays", () => {
    expect(decodeBodyCell(new TextEncoder().encode("raw bytes"))).toBe("raw bytes");
  });
});
