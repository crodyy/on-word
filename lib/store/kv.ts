import { randomBytes } from "node:crypto";
import { kv as vercelKv } from "@vercel/kv";

// Minimal Redis surface our stores need. Tests inject an in-memory fake;
// production passes the @vercel/kv client. High-level ops (compareDel,
// rateHit, rateRelease) keep atomicity requirements in one place instead of
// spreading Lua across every module.
export interface KvLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { ex?: number }): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  hsetnx(key: string, field: string, value: string): Promise<number>;
  hget(key: string, field: string): Promise<string | null>;
  hkeys(key: string): Promise<string[]>;
  // Delete key only when its value equals expected. Returns 1 when deleted.
  compareDel(key: string, expected: string): Promise<number>;
  // Sliding-window hit: prune entries older than now-windowMs, record now
  // unless the wallet already has `limit` hits. Returns the new count, or -1
  // when over the limit (nothing recorded).
  rateHit(key: string, now: number, windowMs: number, limit: number): Promise<number>;
  // Drop the newest hit inside the window (compensation for failed writes).
  rateRelease(key: string, now: number, windowMs: number): Promise<void>;
}

// Test seam. undefined = auto-detect from the environment (production
// behavior); a client or null pins the backend for tests.
let override: KvLike | null | undefined;

export function setKvOverride(client: KvLike | null): void {
  override = client;
}

export function resetKvOverride(): void {
  override = undefined;
}

function envEnabled(): boolean {
  return Boolean(
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
      (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
  );
}

// Low-level commands as exposed by @vercel/kv. Structural so the real client
// fits with a single cast at the call site.
interface RedisCommands {
  get(key: string): Promise<unknown>;
  set(key: string, value: string, opts?: { ex?: number }): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  hsetnx(key: string, field: string, value: string): Promise<number>;
  hget(key: string, field: string): Promise<unknown>;
  hkeys(key: string): Promise<string[]>;
  eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown>;
}

const COMPARE_DEL_SCRIPT =
  `if redis.call("get", KEYS[1]) == ARGV[1] then ` +
  `return redis.call("del", KEYS[1]) else return 0 end`;

const RATE_HIT_SCRIPT =
  `redis.call("zremrangebyscore", KEYS[1], 0, ARGV[2]) ` +
  `if redis.call("zcard", KEYS[1]) >= tonumber(ARGV[3]) then return -1 end ` +
  `redis.call("zadd", KEYS[1], ARGV[1], ARGV[4]) ` +
  `redis.call("expire", KEYS[1], ARGV[5]) ` +
  `return redis.call("zcard", KEYS[1])`;

const RATE_RELEASE_SCRIPT =
  `redis.call("zremrangebyscore", KEYS[1], 0, ARGV[1]) ` +
  `redis.call("zremrangebyrank", KEYS[1], -1, -1)`;

function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : String(value);
}

// Adapter: real Redis client behind the KvLike contract. Only constructed
// when the KV environment is present, so local dev and tests never touch it.
export function createRedisKv(client: RedisCommands): KvLike {
  return {
    async get(key) {
      return toStringOrNull(await client.get(key));
    },
    set(key, value, opts) {
      return client.set(key, value, opts?.ex == null ? undefined : { ex: opts.ex });
    },
    del(...keys) {
      return client.del(...keys);
    },
    hsetnx(key, field, value) {
      return client.hsetnx(key, field, value);
    },
    async hget(key, field) {
      return toStringOrNull(await client.hget(key, field));
    },
    hkeys(key) {
      return client.hkeys(key);
    },
    async compareDel(key, expected) {
      return Number(await client.eval(COMPARE_DEL_SCRIPT, [key], [expected]));
    },
    async rateHit(key, now, windowMs, limit) {
      const token = `${now}-${randomBytes(8).toString("hex")}`;
      const ttlSec = Math.ceil(windowMs / 1000) + 60;
      return Number(
        await client.eval(RATE_HIT_SCRIPT, [key], [now, now - windowMs, limit, token, ttlSec]),
      );
    },
    async rateRelease(key, now, windowMs) {
      await client.eval(RATE_RELEASE_SCRIPT, [key], [now - windowMs]);
    },
  };
}

let cachedRedisKv: KvLike | null | undefined;

export function resolveKv(): KvLike | null {
  if (override !== undefined) return override;
  if (!envEnabled()) return null;
  if (!cachedRedisKv) {
    cachedRedisKv = createRedisKv(vercelKv as unknown as RedisCommands);
  }
  return cachedRedisKv;
}

// Key namespaces. One global namespace per concern; rate limits fan out per
// file basename so posts and comments keep separate quotas exactly as the
// file backend does with separate paths.
export const KV_REGISTRY_WALLETS = "onword:registry:wallets";
export const KV_REGISTRY_NULLIFIERS = "onword:registry:nullifiers";
export const KV_FEED_CACHE = "onword:feedcache:v3";

export function kvNonceKey(wallet: string): string {
  return `onword:nonce:${wallet.toLowerCase()}`;
}

export function kvRateKey(path: string, wallet: string): string {
  const base = (path.split(/[\\/]/).pop() ?? "default").replace(/\.json$/i, "");
  const scope = base.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "default";
  return `onword:ratelimit:${scope}:${wallet.toLowerCase()}`;
}
