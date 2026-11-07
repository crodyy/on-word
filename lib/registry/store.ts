import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { KV_REGISTRY_NULLIFIERS, KV_REGISTRY_WALLETS, resolveKv, type KvLike } from "../store/kv";

export type RegistryErrorCode =
  | "worldid-reused"
  | "wallet-reused"
  | "invalid-wallet"
  | "invalid-nullifier";

export class RegistryError extends Error {
  readonly code: RegistryErrorCode;
  constructor(code: RegistryErrorCode, message: string) {
    super(message);
    this.name = "RegistryError";
    this.code = code;
  }
}

export interface Binding {
  nullifier: string;
  wallet: string;
  createdAt: string;
}

interface RegistryFile {
  version: 1;
  bindings: Binding[];
}

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;
const NULLIFIER_RE = /^0x[0-9a-fA-F]{64}$/;

function normalizeWallet(wallet: string): string {
  if (!WALLET_RE.test(wallet)) {
    throw new RegistryError("invalid-wallet", "wallet must be a 0x address");
  }
  return wallet.toLowerCase();
}

function normalizeNullifier(nullifier: string): string {
  const lower = nullifier.toLowerCase();
  if (!NULLIFIER_RE.test(lower)) {
    throw new RegistryError("invalid-nullifier", "nullifier must be 0x + 64 hex chars");
  }
  return lower;
}

async function readRegistry(path: string): Promise<RegistryFile> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as RegistryFile;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, bindings: [] };
    }
    throw err;
  }
}

async function writeRegistry(path: string, data: RegistryFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, path);
}

export interface RegistryStore {
  register(entry: { nullifier: string; wallet: string }): Promise<Binding>;
  getBinding(wallet: string): Promise<Binding | undefined>;
  getAllowlist(): Promise<string[]>;
}

export function createRegistryStore(path: string): RegistryStore {
  // KV (Vercel) backend when configured: shared across serverless instances,
  // atomic via HSETNX. The file backend below stays for local dev and tests.
  // createRegistryStore is the seam every route uses, so no caller changes.
  const kv = resolveKv();
  if (kv) return createKvRegistryStore(kv);
  // Single-writer queue: check and insert run as one serialized step so two
  // simultaneous signups cannot both pass. Single-process V1; a lockfile
  // would be needed for multiple server instances.
  let tail: Promise<void> = Promise.resolve();
  function serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = tail.then(fn);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  return {
    register(entry) {
      return serialize(async () => {
        const nullifier = normalizeNullifier(entry.nullifier);
        const wallet = normalizeWallet(entry.wallet);
        const data = await readRegistry(path);
        const existing = data.bindings.find((b) => b.nullifier === nullifier);
        if (existing) {
          // Exact replay of the same identity + wallet: idempotent success so
          // a retried verification does not surface as an error.
          if (existing.wallet === wallet) return existing;
          throw new RegistryError("worldid-reused", "this identity is already bound");
        }
        if (data.bindings.some((b) => b.wallet === wallet)) {
          throw new RegistryError("wallet-reused", "this wallet is already bound");
        }
        const binding: Binding = { nullifier, wallet, createdAt: new Date().toISOString() };
        data.bindings.push(binding);
        await writeRegistry(path, data);
        return binding;
      });
    },

    async getBinding(wallet) {
      const data = await readRegistry(path);
      return data.bindings.find((b) => b.wallet === wallet.toLowerCase());
    },

    async getAllowlist() {
      const data = await readRegistry(path);
      return data.bindings.map((b) => b.wallet);
    },
  };
}

const fallbackPath = "./data/registry.json";

let cachedDefault: { path: string; store: RegistryStore } | undefined;
let cachedKvDefault: RegistryStore | undefined;

// KV-backed registry: HSETNX on the nullifier hash is the atomic
// check-and-insert, so simultaneous signups on different serverless
// instances cannot both pass. Fail-closed on partial writes.
export function createKvRegistryStore(kv: KvLike): RegistryStore {
  return {
    async register(entry) {
      const nullifier = normalizeNullifier(entry.nullifier);
      const wallet = normalizeWallet(entry.wallet);
      const first = await kv.hsetnx(KV_REGISTRY_NULLIFIERS, nullifier, wallet);
      if (first === 0) {
        const owner = await kv.hget(KV_REGISTRY_NULLIFIERS, nullifier);
        if (owner === wallet) {
          const raw = await kv.hget(KV_REGISTRY_WALLETS, wallet);
          if (raw) return JSON.parse(raw) as Binding;
          return { nullifier, wallet, createdAt: new Date().toISOString() };
        }
        throw new RegistryError("worldid-reused", "this identity is already bound");
      }
      const second = await kv.hsetnx(
        KV_REGISTRY_WALLETS,
        wallet,
        JSON.stringify({ nullifier, wallet, createdAt: new Date().toISOString() }),
      );
      if (second === 0) {
        // Compensate: we claimed the nullifier above but created no binding.
        // Without this release the identity is locked out of every wallet
        // afterwards (a stuck worldid-reused on retry).
        await kv.hdel(KV_REGISTRY_NULLIFIERS, nullifier).catch(() => undefined);
        throw new RegistryError("wallet-reused", "this wallet is already bound");
      }
      const raw = await kv.hget(KV_REGISTRY_WALLETS, wallet);
      return (JSON.parse(raw as string) as Binding);
    },

    async getBinding(wallet) {
      const raw = await kv
        .hget(KV_REGISTRY_WALLETS, wallet.toLowerCase())
        .catch(() => null);
      if (!raw) return undefined;
      try {
        return JSON.parse(raw) as Binding;
      } catch {
        return undefined;
      }
    },

    async getAllowlist() {
      return kv.hkeys(KV_REGISTRY_WALLETS).catch(() => []);
    },
  };
}

// Lazily bound so tests (and any host) can point REGISTRY_PATH at a scratch
// file before first use. The instance is cached per path, preserving the
// single-writer queue across requests sharing one path.
export function getDefaultStore(): RegistryStore {
  const kv = resolveKv();
  if (kv) {
    if (!cachedKvDefault) cachedKvDefault = createKvRegistryStore(kv);
    return cachedKvDefault;
  }
  const path = process.env.REGISTRY_PATH ?? fallbackPath;
  if (!cachedDefault || cachedDefault.path !== path) {
    cachedDefault = { path, store: createRegistryStore(path) };
  }
  return cachedDefault.store;
}
