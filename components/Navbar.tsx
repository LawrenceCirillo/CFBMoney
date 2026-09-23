"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import TeamSearch from "./TeamSearch";
import ThemeToggle from "./ThemeToggle";

const LINKS = [
  { href: "/", label: "Spending" },
  { href: "/moneyball", label: "Moneyball" },
  { href: "/compare", label: "Compare" },
  { href: "/build", label: "Build" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const mobileNav = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    mobileNav.current?.querySelector("a")?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        menuButton.current?.focus();
        return;
      }

      if (event.key !== "Tab") return;
      const links = Array.from(mobileNav.current?.querySelectorAll("a") ?? []);
      const first = menuButton.current;
      const last = links.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (mobileNav.current?.contains(target) || menuButton.current?.contains(target)) return;
      setMenuOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    function closeOnDesktop() {
      if (desktop.matches) setMenuOpen(false);
    }
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    setSearchOpen(false);
  }, [pathname]);

  return (
    <header className="relative border-b border-line bg-ink/90 backdrop-blur">
      <div className="mx-auto grid h-14 max-w-6xl grid-cols-[1fr_auto] items-center px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <Link href="/" className={`shrink-0 text-lg font-black tracking-tight ${searchOpen ? "hidden sm:block" : ""}`} onClick={() => setMenuOpen(false)}>
          CFB<span className="font-medium text-fog">MONEY</span>
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className="inline-flex min-h-10 items-center rounded-full px-3 py-2 text-sm text-fog transition-ui hover:bg-panel hover:text-paper"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className={`relative flex shrink-0 items-center gap-1 justify-self-end ${searchOpen ? "w-full sm:w-auto" : ""}`}>
          <TeamSearch open={searchOpen} onOpenChange={setSearchOpen} onOpen={() => setMenuOpen(false)} />
          <div className={searchOpen ? "hidden sm:block" : ""}><ThemeToggle /></div>
          <button
            ref={menuButton}
            type="button"
            aria-controls="mobile-primary-navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Menu"
            className={`${searchOpen ? "hidden sm:inline-flex" : "inline-flex"} h-10 w-10 items-center justify-center rounded-full text-paper transition-ui hover:bg-panel focus-visible:bg-panel lg:hidden`}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </div>
      <nav
        id="mobile-primary-navigation"
        ref={mobileNav}
        aria-label="Mobile primary"
        hidden={!menuOpen}
        className="absolute inset-x-0 top-full border-b border-line bg-ink shadow-xl lg:hidden"
      >
        <div className="mx-auto flex max-w-6xl flex-col px-4 pb-3 pt-1">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
              className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-fog transition-ui hover:bg-panel hover:text-paper focus-visible:bg-panel focus-visible:text-paper"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
