import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { verifyMessage, type Hex } from "viem";
import { kvNonceKey, resolveKv } from "../store/kv";

export class ChallengeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChallengeError";
  }
}

const NONCE_TTL_MS = 10 * 60 * 1000;

interface NonceFile {
  version: 1;
  nonces: Record<string, { nonce: string; expiresAt: number }>;
}

async function readState(path: string): Promise<NonceFile> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as NonceFile;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, nonces: {} };
    throw err;
  }
}

async function writeState(path: string, state: NonceFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(state), "utf8");
  await rename(tmp, path);
}

// Per-path promise queue: issue and consume run as one serialized step so two
// simultaneous calls cannot both win. Same pattern as the rate limiter.
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

export interface ChallengeOptions {
  path: string;
  now?: number;
}

// Issues a single-use nonce for the wallet. Re-issuing replaces the previous
// one. Nonces expire after 10 minutes. KV backend when configured, file
// backend otherwise; the path is the file location and is ignored for KV.
export async function issueChallenge(
  wallet: string,
  opts: ChallengeOptions,
): Promise<{ nonce: string; expiresAt: string }> {
  const kv = resolveKv();
  if (kv) {
    const now = opts.now ?? Date.now();
    const nonce = randomBytes(16).toString("hex");
    await kv.set(kvNonceKey(wallet), nonce, { ex: Math.ceil(NONCE_TTL_MS / 1000) });
    return { nonce, expiresAt: new Date(now + NONCE_TTL_MS).toISOString() };
  }
  return serialize(opts.path, async () => {
    const now = opts.now ?? Date.now();
    const nonce = randomBytes(16).toString("hex");
    const state = await readState(opts.path);
    // Prune expired entries on every issue so unauthenticated issuance
    // cannot grow the file without bound.
    for (const [key, entry] of Object.entries(state.nonces)) {
      if (entry.expiresAt <= now) delete state.nonces[key];
    }
    state.nonces[wallet.toLowerCase()] = { nonce, expiresAt: now + NONCE_TTL_MS };
    await writeState(opts.path, state);
    return { nonce, expiresAt: new Date(now + NONCE_TTL_MS).toISOString() };
  });
}

// Consumes the wallet's active nonce. Throws when there is none, it expired,
// or it does not match. Consumption deletes it, so replays fail. The KV
// compare-and-delete is atomic across serverless instances.
export async function consumeChallenge(
  wallet: string,
  nonce: string,
  opts: ChallengeOptions,
): Promise<void> {
  const kv = resolveKv();
  if (kv) {
    const deleted = await kv.compareDel(kvNonceKey(wallet), nonce);
    if (deleted !== 1) throw new ChallengeError("bad challenge");
    return;
  }
  return serialize(opts.path, async () => {
    const now = opts.now ?? Date.now();
    const state = await readState(opts.path);
    const key = wallet.toLowerCase();
    const entry = state.nonces[key];
    if (!entry || entry.nonce !== nonce || entry.expiresAt <= now) {
      throw new ChallengeError("bad challenge");
    }
    delete state.nonces[key];
    await writeState(opts.path, state);
  });
}

// Exact message the wallet signs. Wallets display it verbatim, so it names
// the forum and carries the address plus the single-use nonce.
export function authMessage(wallet: string, nonce: string): string {
  return `on-word auth ${wallet.toLowerCase()} ${nonce}`;
}

// Throws ChallengeError unless signature is a valid personal_sign of the
// wallet's auth message for this nonce.
export async function verifyWalletSignature(input: {
  wallet: string;
  nonce: string;
  signature: string;
}): Promise<void> {
  if (!/^0x[0-9a-fA-F]+$/.test(input.signature)) throw new ChallengeError("bad signature");
  const ok = await verifyMessage({
    address: input.wallet as Hex,
    message: authMessage(input.wallet, input.nonce),
    signature: input.signature as Hex,
  }).catch(() => false);
  if (!ok) throw new ChallengeError("bad signature");
}

export interface WriteAuthHeaders {
  wallet: string | null;
  nonce: string | null;
  signature: string | null;
}

// Full write gate: the x-wallet header is only a hint. The caller must hold a
// registry binding AND prove wallet ownership with a fresh signature over a
// server-issued nonce. Every failure throws ChallengeError so routes map them
// all to a generic 403 with no oracle. Returns the bound (lowercased) wallet.
export async function assertWriteAuth(
  headers: WriteAuthHeaders,
  opts: { getBinding: (wallet: string) => Promise<{ wallet: string } | undefined>; noncePath: string },
): Promise<string> {
  if (!headers.wallet || !headers.nonce || !headers.signature) throw new ChallengeError("missing auth");
  const binding = await opts.getBinding(headers.wallet).catch(() => undefined);
  if (!binding) throw new ChallengeError("unknown wallet");
  // Verify before consuming so a bad signature does not burn a good nonce;
  // the consume step stays serialized so concurrent replays still lose.
  await verifyWalletSignature({ wallet: binding.wallet, nonce: headers.nonce, signature: headers.signature });
  await consumeChallenge(binding.wallet, headers.nonce, { path: opts.noncePath });
  return binding.wallet;
}
