export default function Home() {
  return (
    <main className="py-10">
      <p className="text-sm font-medium text-[var(--color-muted)]">Human-Only Forum</p>
      <h1 className="mt-2 text-4xl font-medium tracking-tight sm:text-5xl">
        One human, one wallet.
      </h1>
      <p className="mt-4 max-w-xl text-lg text-[var(--color-muted)]">
        A forum where every post comes from a verified human, and every post carries a visible
        lifetime.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <a href="/feed" className="btn-press rounded-full bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-[var(--color-accent-ink)]">
          Read the feed
        </a>
        <a href="/signup" className="btn-press rounded-full border border-[var(--color-line)] px-6 py-3 text-sm font-semibold">
          Verify to participate
        </a>
      </div>
    </main>
  );
}
