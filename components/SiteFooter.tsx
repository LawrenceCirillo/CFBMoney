import { getMeta } from "@/lib/data";

export function SiteFooter() {
  const meta = getMeta();
  return (
    <footer className="border-t border-stone bg-white mt-16">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 text-sm text-slate space-y-4">
        <p className="font-display text-lg font-semibold text-obsidian uppercase tracking-wide">
          Data wins debates
        </p>
        <ul className="space-y-1">
          {meta.sources.map((s) => (
            <li key={s.name}>
              <span className="font-medium text-obsidian">{s.name}</span>
              {" — "}
              {s.description}
            </li>
          ))}
        </ul>
        <p className="text-xs leading-relaxed max-w-3xl">
          Roster budgets are reported as ranges with midpoints from The Athletic; never treat
          midpoints as audited payroll. {meta.seasonLabel}. Generated{" "}
          {new Date(meta.generatedAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
          .
        </p>
      </div>
    </footer>
  );
}
