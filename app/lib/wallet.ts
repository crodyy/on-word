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
