import Link from "next/link";
import ThemeToggle from "./ThemeToggle";

const LINKS = [
  { href: "/", label: "Spending" },
  { href: "/moneyball", label: "Moneyball" },
  { href: "/compare", label: "Compare" },
  { href: "/build", label: "Build" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export default function Navbar() {
  return (
    <header className="border-b border-line bg-ink/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="text-lg font-black tracking-tight">
          CFB<span className="font-medium text-fog">MONEY</span>
        </Link>
        <nav className="flex items-center gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex min-h-10 items-center rounded-full px-3 py-2 text-sm text-fog transition-ui hover:bg-panel hover:text-paper"
            >
              {l.label}
            </Link>
          ))}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
