import Link from "next/link";
import { Logo } from "@/components/Logo";
import { TeamSearch } from "@/components/TeamSearch";
import { getTeams } from "@/lib/data";

const NAV = [
  { href: "/spending", label: "Teams" },
  { href: "/spending", label: "Spending" },
  { href: "/moneyball", label: "Moneyball" },
  { href: "/compare", label: "Compare" },
  { href: "/build", label: "Build" },
];

export function SiteHeader() {
  const teams = getTeams();
  return (
    <header className="border-b border-stone bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Logo />
        <nav className="flex flex-wrap items-center gap-6 text-sm font-medium text-obsidian">
          {NAV.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="text-slate hover:text-obsidian transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <TeamSearch teams={teams} />
      </div>
    </header>
  );
}
