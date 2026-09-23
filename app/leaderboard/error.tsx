"use client";

export default function LeaderboardError({ reset }: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6" role="alert">
      <h1 className="font-display text-4xl font-black text-paper">Leaderboard unavailable</h1>
      <p className="mt-4 text-fog">We couldn&apos;t load the leaderboard right now. Please try again shortly.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-ink hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
      >
        Try again
      </button>
    </div>
  );
}
