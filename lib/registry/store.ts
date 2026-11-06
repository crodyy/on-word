import { readFile, rename, writeFile } from "node:fs/promises";

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
        if (data.bindings.some((b) => b.nullifier === nullifier)) {
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

const defaultPath = process.env.REGISTRY_PATH ?? "./data/registry.json";

export const defaultStore: RegistryStore = createRegistryStore(defaultPath);
