"use client";

const KEY = "human-forum.wallet";

export function getBoundWallet(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setBoundWallet(wallet: string): void {
  try {
    window.localStorage.setItem(KEY, wallet.toLowerCase());
  } catch {
    // storage unavailable, session-only
  }
}

export function shortWallet(wallet: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) return wallet;
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

// Exact message the server verifies (lib/auth/challenge.ts authMessage).
// Wallets display it verbatim, so it names the forum and carries the address
// plus the single-use server nonce. Keep both sides identical.
export function authMessage(wallet: string, nonce: string): string {
  return `on-word auth ${wallet.toLowerCase()} ${nonce}`;
}

export async function getChallenge(wallet: string): Promise<{ nonce: string; expiresAt: string }> {
  const res = await fetch(`/api/auth/challenge?wallet=${encodeURIComponent(wallet.toLowerCase())}`);
  if (!res.ok) throw new Error("Could not start wallet signing. Try again.");
  return (await res.json()) as { nonce: string; expiresAt: string };
}

// Signs the server challenge with the injected wallet. The address must be
// the connected account: signing proves the writer holds the bound key.
export async function signAuthMessage(wallet: string, nonce: string): Promise<string> {
  const provider = typeof window !== "undefined" ? window.ethereum : undefined;
  if (!provider) {
    throw new Error("No wallet found in this browser. Connect the bound wallet to continue.");
  }
  const signature = (await provider.request({
    method: "personal_sign",
    params: [authMessage(wallet, nonce), wallet],
  })) as unknown;
  if (typeof signature !== "string" || !signature.startsWith("0x")) {
    throw new Error("The wallet did not return a signature.");
  }
  return signature;
}

// Fetches a fresh server nonce and signs it. Every authenticated write sends
// these three headers; the x-wallet value alone proves nothing.
export async function signedWriteHeaders(wallet: string): Promise<Record<string, string>> {
  const { nonce } = await getChallenge(wallet);
  const signature = await signAuthMessage(wallet, nonce);
  return { "x-wallet": wallet, "x-auth-nonce": nonce, "x-auth-signature": signature };
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown }) => Promise<unknown>;
      on?: (event: string, cb: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, cb: (...args: unknown[]) => void) => void;
    };
  }
}

// Connects an injected EVM wallet (MetaMask and the like). Returns the first
// account lowercased. Throws a human-readable error when there is no provider
// or the user rejects.
export async function connectInjectedWallet(): Promise<string> {
  const provider = typeof window !== "undefined" ? window.ethereum : undefined;
  if (!provider) {
    throw new Error("No wallet found in this browser. Install MetaMask or paste your address below.");
  }
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts || accounts.length === 0) throw new Error("No account shared. Approve the connection and try again.");
  return accounts[0].toLowerCase();
}

export function countdownTo(iso: string, now: number = Date.now()): string {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "expired";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  if (m > 0) return `${m}m left`;
  return `${s}s left`;
}
