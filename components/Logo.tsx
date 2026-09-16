import Link from "next/link";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex flex-col leading-none hover:opacity-90 transition-opacity ${className}`}
    >
      <span className="font-display text-xl font-bold tracking-tight text-obsidian sm:text-2xl">
        CFB<span className="text-lime">&gt;</span>MONEY
      </span>
      <span className="mt-0.5 text-[9px] font-medium tracking-[0.2em] text-slate uppercase sm:text-[10px]">
        College Football by the Numbers
      </span>
    </Link>
  );
}
