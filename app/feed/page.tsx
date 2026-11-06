"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChatCircle, Clock, Info, Plus } from "@phosphor-icons/react";
import { countdownTo, getBoundWallet, shortWallet } from "../lib/wallet";
import type { FeedResponse } from "@/lib/types";

export default function FeedPage() {
  const [data, setData] = useState<FeedResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [wallet, setWallet] = useState<string | null>(null);

  useEffect(() => {
    setWallet(getBoundWallet());
    fetch("/api/posts")
      .then((r) => {
        if (!r.ok) throw new Error("feed failed");
        return r.json();
      })
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  return (
    <main className="py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mt-1 text-3xl font-medium tracking-tight">Feed</h1>
        </div>
        {wallet ? (
          <Link
            href="/post/new"
            className="btn-press inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm font-semibold text-[var(--color-paper)]"
          >
            <Plus size={16} /> New post
          </Link>
        ) : null}
      </div>

      {!wallet && data ? (
        <div className="mt-6 flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <Info size={20} className="mt-0.5 shrink-0 text-[var(--color-ink)]" />
          <p className="text-sm">
            You are reading as a visitor. <Link href="/signup" className="font-semibold whitespace-nowrap underline">Verify with World ID</Link> to
            post and comment.
          </p>
        </div>
      ) : null}

      {failed ? (
        <p role="alert" className="mt-6 text-sm font-bold">
          The feed could not load. Check your connection and refresh.
        </p>
      ) : !data ? (
        <div className="mt-6 space-y-3" aria-label="Loading feed">
          {[0, 1, 2].map((i) => (
            <div key={i} className="animate-pulse rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
              <div className="h-5 w-2/3 rounded bg-[var(--color-line)]" />
              <div className="mt-2 h-4 w-1/3 rounded bg-[var(--color-line)]" />
            </div>
          ))}
        </div>
      ) : data.posts.length === 0 && data.archived.length === 0 ? (
        <div className="mt-6 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-8 text-center">
          <p className="text-lg font-medium">No live posts yet.</p>
          <p className="mt-2 text-xs font-bold">
            {wallet ? "Be the first to post. Pick a lifetime of 1, 7, or 30 days." : "Verified humans have not posted yet. Check back soon."}
          </p>
          {!wallet ? (
            <Link href="/signup" className="btn-press mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-ink)] px-6 py-3 text-sm font-semibold text-[var(--color-paper)]">
              Verify with World ID
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          <ul className="mt-6 space-y-3">
            {data.posts.map((p) => (
              <li key={p.key}>
                <Link
                  href={`/post/${p.key}`}
                  className="card-lift block rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5"
                >
                  <p className="text-lg font-medium">{p.title}</p>
                  <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="font-mono">{shortWallet(p.owner)}</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock size={15} /> {countdownTo(p.expiresAt)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <ChatCircle size={15} /> {p.commentCount} {p.commentCount === 1 ? "comment" : "comments"}
                    </span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          {data.archived.length > 0 ? (
            <section className="mt-10" aria-label="Archived posts">
              <h2 className="text-sm font-semibold uppercase tracking-wide">Archived</h2>
              <ul className="mt-3 space-y-3">
                {data.archived.map((p) => (
                  <li key={p.key} className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
                    <p className="text-lg font-medium">{p.title}</p>
                    <p className="mt-2 text-sm">
                      <span className="font-mono">{shortWallet(p.owner)}</span> · expired, kept for the record
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
