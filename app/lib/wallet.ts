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
