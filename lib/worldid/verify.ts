import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { getDefaultStore, RegistryError, type RegistryStore } from "../registry/store";

export type VerifyErrorCode = "verify-failed" | "worldid-reused" | "wallet-reused";

export class VerifyError extends Error {
  readonly code: VerifyErrorCode;
  constructor(code: VerifyErrorCode, message: string) {
    super(message);
    this.name = "VerifyError";
    this.code = code;
  }
}

interface IdkitResponseItem {
  nullifier?: string;
  signal_hash?: string;
}

interface IdkitResponse {
  action?: string;
  environment?: string;
  responses?: IdkitResponseItem[];
}

interface VerifyApiSuccess {
  success: true;
  action?: string;
  nullifier?: string;
  environment?: string;
}

export interface VerifyOptions {
  store: RegistryStore;
  rpId: string;
  expectedAction: string;
  expectedEnv: string;
}

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;

function asRecord(value: unknown): IdkitResponse {
  if (typeof value !== "object" || value === null) throw new VerifyError("verify-failed", "bad proof shape");
  return value as IdkitResponse;
}

export async function verifyProof(
  input: { idkitResponse: unknown; wallet: string },
  opts: VerifyOptions,
): Promise<{ ok: true; nullifier: string }> {
  const { store, rpId, expectedAction, expectedEnv } = opts;
  const wallet = input.wallet;
  if (!WALLET_RE.test(wallet)) throw new VerifyError("verify-failed", "bad wallet");
  const walletLower = wallet.toLowerCase();

  const body = asRecord(input.idkitResponse);
  if (body.environment !== expectedEnv) throw new VerifyError("verify-failed", "environment mismatch");
  const responses = body.responses;
  if (!Array.isArray(responses) || responses.length === 0) {
    throw new VerifyError("verify-failed", "no responses");
  }
  const expectedSignalHash = hashSignal(walletLower).toLowerCase();
  for (const r of responses) {
    if (typeof r.signal_hash === "string" && r.signal_hash.toLowerCase() !== expectedSignalHash) {
      throw new VerifyError("verify-failed", "signal mismatch");
    }
  }

  const apiRes = await fetch(`https://developer.world.org/api/v4/verify/${rpId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input.idkitResponse),
  });
  const data = (await apiRes.json().catch(() => null)) as VerifyApiSuccess | null;
  if (!data || data.success !== true) throw new VerifyError("verify-failed", "proof rejected");
  if (data.environment !== expectedEnv) throw new VerifyError("verify-failed", "environment mismatch");
  if (typeof data.action === "string" && data.action !== expectedAction) {
    throw new VerifyError("verify-failed", "action mismatch");
  }
  if (typeof data.nullifier !== "string") throw new VerifyError("verify-failed", "no nullifier");

  try {
    const binding = await store.register({ nullifier: data.nullifier, wallet });
    return { ok: true, nullifier: binding.nullifier };
  } catch (err) {
    if (err instanceof RegistryError && (err.code === "worldid-reused" || err.code === "wallet-reused")) {
      throw new VerifyError(err.code, err.message);
    }
    throw err;
  }
}

export function getDefaultVerifyStore(): RegistryStore {
  return getDefaultStore();
}
