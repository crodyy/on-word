"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getBoundWallet, signedWriteHeaders } from "../../lib/wallet";

const DAYS = [1, 3, 5] as const;
type Lifetime = { days: (typeof DAYS)[number] } | { hours: 1 };

const LIFETIMES: { label: string; value: Lifetime }[] = [
  { label: "1 hour", value: { hours: 1 } },
  { label: "1 day", value: { days: 1 } },
  { label: "3 days", value: { days: 3 } },
  { label: "5 days", value: { days: 5 } },
];

export default function NewPostPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [lifetime, setLifetime] = useState<Lifetime>({ days: 3 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleBytes = new TextEncoder().encode(title).length;
  const bodyBytes = new TextEncoder().encode(body).length;

  async function submit() {
    setError(null);
    const wallet = getBoundWallet();
    if (!wallet) {
      setError("You are not verified on this device. Verify first.");
      return;
    }
    if (titleBytes === 0 || titleBytes > 128) {
      setError("Title must be 1 to 128 bytes.");
      return;
    }
    if (bodyBytes === 0 || bodyBytes > 5 * 1024) {
      setError("Body must be 1 byte to 5 KB.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await signedWriteHeaders(wallet)) },
        body: JSON.stringify({ title, body, ...lifetime }),
      });
      if (res.status === 403) throw new Error("This wallet is not bound or the signature failed. Verify first.");
      if (res.status === 429) throw new Error("Slow down. The limit is 5 posts per day.");
      if (!res.ok) throw new Error("Could not publish. Try again.");
      const data = (await res.json()) as { entityKey: string };
      router.push(`/post/${data.entityKey}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not publish.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="py-10">
      <p className="text-sm font-medium">
        <Link href="/feed" className="underline">Feed</Link> / New post
      </p>
      <h1 className="mt-1 text-3xl font-medium tracking-tight">New post</h1>

      <div className="mt-6 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
        <label htmlFor="title" className="block text-sm font-medium">Title</label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          className="mt-2 w-full rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-3 text-sm outline-none focus:border-[var(--color-ink)]"
        />
        <p className="mt-1 text-xs">{titleBytes} of 128 bytes</p>

        <label htmlFor="body" className="mt-5 block text-sm font-medium">Body</label>
        <textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          className="mt-2 w-full rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-3 text-sm outline-none focus:border-[var(--color-ink)]"
        />
        <p className="mt-1 text-xs">{bodyBytes} of 5120 bytes</p>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium">Lifetime</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {LIFETIMES.map((opt) => {
              const active = JSON.stringify(opt.value) === JSON.stringify(lifetime);
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setLifetime(opt.value)}
                  aria-pressed={active}
                  className={`btn-press rounded-full border px-5 py-2 text-sm font-semibold ${
                    active
                      ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-paper)]"
                      : "border-[var(--color-line)]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs">
            The post disappears from the feed when time runs out. Extending is possible while it is live.
          </p>
        </fieldset>

        {error ? (
          <p role="alert" className="mt-4 text-sm font-bold">{error}</p>
        ) : null}

        <button
          onClick={submit}
          disabled={busy}
          className="btn-press mt-5 rounded-full bg-[var(--color-ink)] px-6 py-3 text-sm font-semibold text-[var(--color-paper)] disabled:cursor-not-allowed"
        >
          {busy ? "Publishing..." : "Publish post"}
        </button>
      </div>
    </main>
  );
}
