"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Clock, PencilSimple, Spinner } from "@phosphor-icons/react";
import { countdownTo, getBoundWallet, shortWallet, signedWriteHeaders } from "../../lib/wallet";
import type { CommentsResponse, FeedResponse, ThreadPost } from "@/lib/types";

export default function ThreadPage() {
  const { key } = useParams<{ key: string }>();
  const [post, setPost] = useState<FeedResponse["posts"][number] | null>(null);
  const [detail, setDetail] = useState<ThreadPost | null>(null);
  const [archived, setArchived] = useState(false);
  const [comments, setComments] = useState<CommentsResponse["comments"]>([]);
  const [missing, setMissing] = useState(false);
  const [wallet, setWallet] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [editing, setEditing] = useState(false);
  const [extendLifetime, setExtendLifetime] = useState<{ days?: 1 | 3 | 5; hours?: 1 }>({ days: 3 });

  useEffect(() => {
    setWallet(getBoundWallet());
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/posts");
        if (!r.ok) throw new Error("feed failed");
        const d = (await r.json()) as FeedResponse;
        if (cancelled) return;
        const found = d.posts.find((p) => p.key === key);
        if (found) {
          setPost(found);
          setTitle(found.title);
        } else if (d.archived.find((p) => p.key === key)) {
          setArchived(true);
          return;
        } else {
          // The feed query index can lag behind a just-created post. Confirm
          // with a direct entity read before calling it missing.
          const det = await fetch(`/api/posts/${encodeURIComponent(key)}`)
            .then((x) => (x.ok ? x.json() : null))
            .catch(() => null) as ThreadPost | null;
          if (cancelled) return;
          if (det) {
            setDetail(det);
            setBodyText(det.body);
            setPost({
              key: det.key,
              title: det.title,
              excerpt: det.body.slice(0, 180),
              owner: det.owner,
              expiresAt: det.expiresAt,
              commentCount: 0,
              expired: false,
            });
            setTitle(det.title);
          } else {
            setMissing(true);
            return;
          }
        }
      } catch {
        if (!cancelled) setMissing(true);
        return;
      }
      fetch(`/api/comments?postKey=${encodeURIComponent(key)}`)
        .then((r) => (r.ok ? r.json() : { comments: [] }))
        .then((d: CommentsResponse) => { if (!cancelled) setComments(d.comments); })
        .catch(() => undefined);
      fetch(`/api/posts/${encodeURIComponent(key)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: ThreadPost | null) => {
          if (cancelled || !d) return;
          setDetail(d);
          setBodyText((cur) => cur || d.body);
        })
        .catch(() => undefined);
    }
    load();
    return () => { cancelled = true; };
  }, [key]);

  const isOwner = !!wallet && !!post && wallet.toLowerCase() === post.owner.toLowerCase();

  async function submitComment() {
    setError(null);
    if (!wallet) {
      setError("Verify first to comment.");
      return;
    }
    const bytes = new TextEncoder().encode(draft).length;
    if (bytes === 0 || bytes > 5 * 1024) {
      setError("Comment must be 1 byte to 5 KB.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await signedWriteHeaders(wallet)) },
        body: JSON.stringify({ postKey: key, body: draft }),
      });
      if (res.status === 403) throw new Error("This wallet is not bound or the signature failed. Verify first.");
      if (res.status === 404) throw new Error("This post no longer accepts comments.");
      if (!res.ok) throw new Error("Could not post the comment.");
      setDraft("");
      const d = (await fetch(`/api/comments?postKey=${encodeURIComponent(key)}`).then((r) => r.json())) as CommentsResponse;
      setComments(d.comments);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post the comment.");
    } finally {
      setBusy(false);
    }
  }

  async function submitExtend() {
    setError(null);
    if (!wallet || !post) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/posts/${key}/extend`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(await signedWriteHeaders(wallet)) },
        body: JSON.stringify(extendLifetime),
      });
      if (res.status === 403) throw new Error("Only the author can extend.");
      if (!res.ok) throw new Error("Could not extend.");
      const d = (await fetch("/api/posts").then((r) => r.json())) as FeedResponse;
      const found = d.posts.find((p) => p.key === key);
      if (found) setPost(found);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not extend.");
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit() {
    setError(null);
    if (!wallet || !post) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/posts/${key}/edit`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(await signedWriteHeaders(wallet)) },
        body: JSON.stringify({ title, body: bodyText || undefined }),
      });
      if (res.status === 403) throw new Error("Only the author can edit.");
      if (!res.ok) throw new Error("Could not save.");
      setEditing(false);
      setPost({ ...post, title });
      if (bodyText) setDetail((d) => (d ? { ...d, title, body: bodyText } : d));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  if (missing) {
    return (
      <main className="py-10">
        <p className="text-sm"><Link href="/feed" className="underline">Feed</Link></p>
        <h1 className="mt-2 text-2xl font-medium">Post not found.</h1>
        <p className="mt-2 text-sm">It may have expired and left no cached copy, or the link is wrong.</p>
      </main>
    );
  }

  if (archived) {
    return (
      <main className="py-10">
        <p className="text-sm"><Link href="/feed" className="underline">Feed</Link></p>
        <h1 className="mt-2 text-2xl font-medium">This post is archived.</h1>
        <p className="mt-2 text-sm">Its lifetime ran out. The record stays visible in the feed archive.</p>
      </main>
    );
  }

  if (!post) {
    return (
      <main className="py-10" aria-label="Loading post">
        <div className="animate-pulse rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
          <div className="h-6 w-2/3 rounded bg-[var(--color-line)]" />
          <div className="mt-3 h-4 w-1/3 rounded bg-[var(--color-line)]" />
        </div>
      </main>
    );
  }

  return (
    <main className="py-10">
      <p className="text-sm"><Link href="/feed" className="underline">Feed</Link></p>
      <div className="mt-2 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {editing ? (
            <>
              <label htmlFor="edit-title" className="block text-sm font-medium">Title</label>
              <input
                id="edit-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                className="mt-2 w-full rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-2.5 text-3xl font-medium tracking-tight outline-none focus:border-[var(--color-ink)]"
              />
            </>
          ) : (
            <h1 className="text-3xl font-medium tracking-tight">{post.title}</h1>
          )}
        </div>
        {isOwner ? (
          <div className="flex shrink-0 items-center gap-2 pt-1">
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} disabled={busy} className="btn-press rounded-full border border-[var(--color-line)] px-4 py-1.5 text-sm font-semibold disabled:cursor-not-allowed">
                  Cancel
                </button>
                <button onClick={submitEdit} disabled={busy} className="btn-press rounded-full bg-[var(--color-ink)] px-4 py-1.5 text-sm font-semibold text-[var(--color-paper)] disabled:cursor-not-allowed">
                  {busy ? "Saving..." : "Save changes"}
                </button>
              </>
            ) : (
              <button onClick={() => { if (detail && !bodyText) setBodyText(detail.body); setEditing(true); }} className="btn-press inline-flex items-center gap-1 rounded-full border border-[var(--color-line)] px-4 py-1.5 text-sm font-semibold">
                <PencilSimple size={15} /> Edit
              </button>
            )}
          </div>
        ) : null}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-mono">{shortWallet(post.owner)}</span>
        <span className="inline-flex items-center gap-1"><Clock size={15} /> {countdownTo(post.expiresAt)}</span>
      </p>

      {editing ? (
        <div className="mt-4">
          <label htmlFor="edit-body" className="block text-sm font-medium">Body</label>
          <textarea id="edit-body" value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={6} className="mt-2 w-full whitespace-pre-wrap rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-2.5 text-base leading-relaxed outline-none focus:border-[var(--color-ink)]" />
        </div>
      ) : (
        detail ? (
          <p className="mt-4 whitespace-pre-wrap text-base leading-relaxed">{detail.body}</p>
        ) : null
      )}

      {isOwner ? (
        <section className="mt-6 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-5" aria-label="Lifetime">
          <h2 className="text-sm font-semibold">Lifetime</h2>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
            {[{ label: "+1h", value: { hours: 1 } }, { label: "+1d", value: { days: 1 } }, { label: "+3d", value: { days: 3 } }, { label: "+5d", value: { days: 5 } }].map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => setExtendLifetime(opt.value as { days?: 1 | 3 | 5; hours?: 1 })}
                aria-pressed={JSON.stringify(extendLifetime) === JSON.stringify(opt.value)}
                className={`btn-press rounded-full border px-4 py-1.5 text-sm font-semibold ${JSON.stringify(extendLifetime) === JSON.stringify(opt.value) ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-paper)]" : "border-[var(--color-line)]"}`}
              >
                {opt.label}
              </button>
            ))}
            </div>
            <button onClick={submitExtend} disabled={busy} className="btn-press ml-auto rounded-full bg-[var(--color-ink)] px-4 py-1.5 text-sm font-semibold text-[var(--color-paper)] disabled:cursor-not-allowed">
              Extend
            </button>
          </div>
        </section>
      ) : null}

      {error ? <p role="alert" className="mt-4 text-sm font-bold">{error}</p> : null}

      <section className="mt-8" aria-label="Comments">
        <h2 className="text-lg font-medium">Comments ({comments.length})</h2>
        <p className="mt-1 text-sm">Comments are fixed at 1 day and cannot be edited.</p>
        {comments.length === 0 ? (
          <p className="mt-3 text-sm">No comments yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {comments.map((c) => (
              <li key={c.key} className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
                <p className="text-sm">{c.body}</p>
                <p className="mt-2 text-xs">
                  <span className="font-mono">{shortWallet(c.author)}</span> · {countdownTo(c.expiresAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
        {wallet ? (
          <div className="mt-4">
            <label htmlFor="comment" className="block text-sm font-medium">Add a comment</label>
            <textarea id="comment" value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} className="mt-2 w-full rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-2.5 text-sm outline-none focus:border-[var(--color-ink)]" />
            <button onClick={submitComment} disabled={busy} className="btn-press mt-2 inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2 text-sm font-semibold text-[var(--color-paper)] disabled:cursor-not-allowed">
              {busy ? <Spinner size={15} className="animate-spin" /> : null} Post comment
            </button>
          </div>
        ) : (
          <p className="mt-4 text-sm"><Link href="/signup" className="font-semibold underline">Verify</Link> to join the discussion.</p>
        )}
      </section>
    </main>
  );
}
