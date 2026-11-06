"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, Moon, SignOut, Sun, UserCircle } from "@phosphor-icons/react";
import { applyTheme, getStoredTheme, toggleTheme, type Theme } from "../lib/theme";
import { getBoundWallet, setBoundWallet, shortWallet } from "../lib/wallet";

export default function SiteHeader() {
  const [theme, setTheme] = useState<Theme>("light");
  const [wallet, setWallet] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = getStoredTheme();
    setTheme(stored);
    applyTheme(stored);
    setWallet(getBoundWallet());
  }, []);

  useEffect(() => {
    if (!menu) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenu(false);
    }
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [menu]);

  async function copy() {
    if (!wallet) return;
    try {
      await navigator.clipboard.writeText(wallet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable, address stays selectable
    }
  }

  function disconnect() {
    setBoundWallet("");
    setWallet(null);
    setMenu(false);
  }

  return (
    <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-4 sm:px-8">
      <Link href="/" className="flex items-center gap-2" aria-label="Human-Only Forum home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpg" alt="Human-Only Forum lotus logo" width={72} height={72} className="rounded-full grayscale contrast-125" />
        <span className="text-sm font-bold">Human-Only Forum</span>
      </Link>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTheme(toggleTheme())}
          aria-pressed={theme === "dark"}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="btn-press rounded-full border border-[var(--color-line)] p-2"
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        {wallet ? (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenu((v) => !v)}
              aria-expanded={menu}
              aria-label="Profile menu"
              className="btn-press flex items-center gap-2 rounded-full border border-[var(--color-line)] px-3 py-2 text-sm font-bold"
            >
              <UserCircle size={18} />
              <span className="font-mono">{shortWallet(wallet)}</span>
            </button>
            {menu ? (
              <div className="absolute right-0 z-10 mt-2 w-64 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-paper)] p-3">
                <p className="break-all font-mono text-xs">{wallet}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={copy}
                    className="btn-press inline-flex flex-1 items-center justify-center gap-1 rounded-full border border-[var(--color-line)] px-3 py-1.5 text-xs font-bold"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <button
                    onClick={disconnect}
                    className="btn-press inline-flex flex-1 items-center justify-center gap-1 rounded-full border border-[var(--color-line)] px-3 py-1.5 text-xs font-bold"
                  >
                    <SignOut size={14} />
                    Disconnect
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <Link
            href="/signup"
            aria-label="Profile, verify to participate"
            className="btn-press rounded-full border border-[var(--color-line)] p-2"
          >
            <UserCircle size={18} />
          </Link>
        )}
      </div>
    </header>
  );
}
