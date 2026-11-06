import { readFile, rename, writeFile } from "node:fs/promises";

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

// Throws RateLimitedError when the wallet already posted `limit` times in the
// window. Records the hit otherwise. File-backed so restarts keep counts.
export async function checkAndRecord(wallet: string, opts: RateLimitOptions): Promise<void> {
  const limit = opts.limit ?? MAX_POSTS_PER_DAY;
  const windowMs = opts.windowMs ?? WINDOW_MS;
  const now = opts.now ?? Date.now();
  const key = wallet.toLowerCase();
  const state = await readState(opts.path);
  const recent = (state.hits[key] ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) throw new RateLimitedError();
  recent.push(now);
  state.hits[key] = recent;
  const tmp = `${opts.path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(state), "utf8");
  await rename(tmp, opts.path);
}
