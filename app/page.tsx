"use client";

import { useEffect, useState } from "react";
import { getBoundWallet } from "./lib/wallet";

export default function Home() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setWallet(getBoundWallet());
    setReady(true);
  }, []);

  return (
    <main className="py-10">
      <h1 className="mt-2 text-4xl font-medium tracking-tight sm:text-5xl">
        One human, one wallet.
      </h1>
      <p className="mt-4 max-w-xl text-lg">
        A forum where every post comes from a verified human, and every post carries a visible
        lifetime.
      </p>
      {ready ? (
        wallet ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/feed" className="btn-press rounded-full bg-[var(--color-ink)] px-6 py-3 text-sm font-semibold text-[var(--color-paper)]">
              Go to the feed
            </a>
            <a href="/post/new" className="btn-press rounded-full border border-[var(--color-line)] px-6 py-3 text-sm font-semibold">
              New post
            </a>
          </div>
        ) : (
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/feed" className="btn-press rounded-full bg-[var(--color-ink)] px-6 py-3 text-sm font-semibold text-[var(--color-paper)]">
              Read the feed
            </a>
            <a href="/signup" className="btn-press rounded-full border border-[var(--color-line)] px-6 py-3 text-sm font-semibold">
              Verify to participate
            </a>
          </div>
        )
      ) : null}
    </main>
  );
}
