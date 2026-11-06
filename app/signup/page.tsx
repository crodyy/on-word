"use client";

import { useState } from "react";
import Link from "next/link";
import { IDKitRequestWidget, orbLegacy, type IDKitResult } from "@worldcoin/idkit";
import { ShieldCheck, Spinner, Wallet, WarningCircle } from "@phosphor-icons/react";
import { connectInjectedWallet, setBoundWallet, shortWallet } from "../lib/wallet";

const APP_ID = (process.env.NEXT_PUBLIC_WORLD_APP_ID ?? "") as `app_${string}`;
const ACTION = process.env.NEXT_PUBLIC_WORLD_ACTION ?? "human-forum-register-v1";
const ENVIRONMENT = (process.env.NEXT_PUBLIC_WORLD_ENVIRONMENT ?? "staging") as
  | "staging"
  | "production"
  | "sandbox";
const RP_ID = process.env.NEXT_PUBLIC_WORLD_RP_ID ?? "";

type RP = { sig: string; nonce: string; created_at: number; expires_at: number };

export default function SignupPage() {
  const [wallet, setWallet] = useState("");
  const [manual, setManual] = useState(false);
  const [rp, setRp] = useState<RP | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const walletOk = /^0x[0-9a-fA-F]{40}$/.test(wallet.trim());

  async function connect() {
    setError(null);
    setBusy(true);
    try {
      setWallet(await connectInjectedWallet());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect.");
      setManual(true);
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setError(null);
    if (!walletOk) {
      setError("Connect your wallet first.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/rp-signature", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: ACTION }),
      });
      if (!res.ok) throw new Error("Could not start verification. Try again.");
      setRp(await res.json());
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start verification.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(result: IDKitResult): Promise<void> {
    const res = await fetch("/api/verify-proof", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idkitResponse: result, wallet: wallet.trim().toLowerCase() }),
    });
    if (res.status === 409) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (data?.error === "worldid-reused") {
        throw new Error("This World ID is already bound to a wallet. One human, one wallet.");
      }
      throw new Error("This wallet is already bound. One human, one wallet.");
    }
    if (!res.ok) throw new Error("Verification failed. Try again.");
  }

  function onSuccess() {
    setBoundWallet(wallet.trim());
    setDone(true);
  }

  return (
    <main className="py-10">
      <h1 className="mt-2 text-4xl font-medium tracking-tight sm:text-5xl">
        One human, one wallet.
      </h1>
      <p className="mt-4 max-w-xl text-lg">
        Verify with World ID to lock a wallet to your identity. Posts then live on lifetimes you choose.
      </p>

      <div className="mt-8 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
        <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-line)] p-4">
          <WarningCircle size={22} className="mt-0.5 shrink-0 text-[var(--color-ink)]" />
          <p className="text-sm">
            <span className="font-semibold">This lock is permanent and cannot be changed.</span>
            <br />
            Your World ID and your wallet stay bound together. Lose the wallet and you lose access
            in V1.
          </p>
        </div>

        <p className="text-sm font-medium">Your wallet</p>
        {walletOk ? (
          <div className="mt-2 flex items-center justify-between rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-3">
            <span className="font-mono text-sm" title={wallet}>{shortWallet(wallet.trim())}</span>
            <button onClick={() => { setWallet(""); setManual(false); }} className="text-sm font-semibold underline">
              Change
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={connect}
              disabled={busy}
              className="btn-press mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[var(--color-ink)] px-6 py-3 text-sm font-semibold disabled:cursor-not-allowed"
            >
              {busy ? <Spinner size={18} className="animate-spin" /> : <Wallet size={18} />}
              Connect wallet
            </button>
            {manual ? (
              <>
                <label htmlFor="wallet" className="mt-4 block text-sm font-medium">Or paste your address</label>
                <input
                  id="wallet"
                  value={wallet}
                  onChange={(e) => setWallet(e.target.value)}
                  placeholder="0x..."
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-2 w-full rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-3 font-mono text-sm outline-none focus:border-[var(--color-ink)]"
                />
              </>
            ) : (
              <button onClick={() => setManual(true)} className="mt-3 text-sm font-medium underline">
                No wallet extension? Paste an address instead
              </button>
            )}
          </>
        )}
        {error ? (
          <p role="alert" className="mt-2 text-sm font-bold">
            {error}
          </p>
        ) : null}

        <button
          onClick={start}
          disabled={busy || !walletOk}
          className="btn-press mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-ink)] px-6 py-3 text-sm font-semibold text-[var(--color-paper)] disabled:cursor-not-allowed"
        >
          {busy ? <Spinner size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
          Verify with World ID
        </button>

        {done ? (
          <p className="mt-4 text-sm font-medium">
            Verified and bound. <Link href="/feed" className="underline">Go to the feed</Link>
          </p>
        ) : null}
      </div>

      {rp ? (
        <IDKitRequestWidget
          open={open}
          onOpenChange={setOpen}
          app_id={APP_ID}
          action={ACTION}
          rp_context={{ rp_id: RP_ID, nonce: rp.nonce, created_at: rp.created_at, expires_at: rp.expires_at, signature: rp.sig }}
          allow_legacy_proofs={true}
          preset={orbLegacy({ signal: wallet.trim().toLowerCase() })}
          environment={ENVIRONMENT}
          handleVerify={handleVerify}
          onSuccess={onSuccess}
        />
      ) : null}
    </main>
  );
}
