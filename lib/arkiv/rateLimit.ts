import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class RateLimitedError extends Error {
  constructor() {
    super("rate limited: 5 posts per day");
    this.name = "RateLimitedError";
  }
}

const WINDOW_MS = 24 * 3600 * 1000;
export const MAX_POSTS_PER_DAY = 5;

interface RateFile {
  version: 1;
  hits: Record<string, number[]>;
}

async function readState(path: string): Promise<RateFile> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as RateFile;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, hits: {} };
    throw err;
  }
}

export interface RateLimitOptions {
  path: string;
  limit?: number;
  windowMs?: number;
  now?: number;
}

// Per-path promise queue: check and insert run as one serialized step so two
// simultaneous posts cannot both pass. Same pattern as the registry store.
const tails = new Map<string, Promise<void>>();

function serialize<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const tail = tails.get(key) ?? Promise.resolve();
  const run = tail.then(fn);
  tails.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

// Throws RateLimitedError when the wallet already posted `limit` times in the
// window. Records the hit otherwise. File-backed so restarts keep counts.
export async function checkAndRecord(wallet: string, opts: RateLimitOptions): Promise<void> {
  return serialize(opts.path, async () => {
    const limit = opts.limit ?? MAX_POSTS_PER_DAY;
    const windowMs = opts.windowMs ?? WINDOW_MS;
    const now = opts.now ?? Date.now();
    const key = wallet.toLowerCase();
    const state = await readState(opts.path);
    const recent = (state.hits[key] ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) throw new RateLimitedError();
    recent.push(now);
    state.hits[key] = recent;
    await mkdir(dirname(opts.path), { recursive: true });
    const tmp = `${opts.path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(state), "utf8");
    await rename(tmp, opts.path);
  });
}
