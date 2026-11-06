import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { consumeChallenge, verifyWalletSignature } from "../auth/challenge";
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

interface VerifyApiResultItem {
  success?: boolean;
  nullifier?: string;
  code?: string;
}

interface VerifyApiSuccess {
  success: true;
  action?: string;
  nullifier?: string;
  results?: VerifyApiResultItem[];
  environment?: string;
}

export interface VerifyOptions {
  store: RegistryStore;
  rpId: string;
  expectedAction: string;
  expectedEnv: string;
  noncePath: string;
}

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;

function asRecord(value: unknown): IdkitResponse {
  if (typeof value !== "object" || value === null) throw new VerifyError("verify-failed", "bad proof shape");
  return value as IdkitResponse;
}

export async function verifyProof(
  input: { idkitResponse: unknown; wallet: string; signature?: string; nonce?: string },
  opts: VerifyOptions,
): Promise<{ ok: true; nullifier: string }> {
  const { store, rpId, expectedAction, expectedEnv, noncePath } = opts;
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
    // Fail closed: every response must carry the wallet's signal hash.
    // An omitted signal_hash skips the check otherwise.
    if (typeof r.signal_hash !== "string" || r.signal_hash.toLowerCase() !== expectedSignalHash) {
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
  // Fail closed: the World-returned action must equal the expected action.
  // An omitted action passed the old gate.
  if (data.action !== expectedAction) {
    throw new VerifyError("verify-failed", "action mismatch");
  }
  // Top-level nullifier is present for most responses, but some flows only
  // return per-result nullifiers inside results[]. Accept either.
  const topNullifier = typeof data.nullifier === "string" ? data.nullifier : null;
  const items = Array.isArray(data.results) ? data.results : [];
  const okItem = items.find(
    (r) => r && r.success === true && typeof r.nullifier === "string",
  );
  const nullifier = topNullifier ?? okItem?.nullifier ?? null;
  if (typeof nullifier !== "string") throw new VerifyError("verify-failed", "no nullifier");

  // Wallet ownership: the caller must prove they hold the wallet's key with a
  // fresh signature over a server-issued nonce. Verified after the World proof
  // so bad proofs never burn nonces, and before register() so nothing is
  // reserved for an unowned wallet.
  if (typeof input.signature !== "string" || typeof input.nonce !== "string") {
    throw new VerifyError("verify-failed", "missing wallet signature");
  }
  try {
    await verifyWalletSignature({ wallet: walletLower, nonce: input.nonce, signature: input.signature });
    await consumeChallenge(walletLower, input.nonce, { path: noncePath });
  } catch {
    throw new VerifyError("verify-failed", "bad wallet signature");
  }

  try {
    const binding = await store.register({ nullifier, wallet });
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
