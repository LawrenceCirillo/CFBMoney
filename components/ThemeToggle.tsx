"use client";

import { useTheme } from "./ThemeProvider";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isLight = theme === "light";
  return (
    <button
      onClick={toggle}
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      title={isLight ? "Switch to dark mode" : "Switch to light mode"}
      className="ml-1 relative flex h-10 w-10 items-center justify-center rounded-full text-fog transition-ui hover:bg-panel hover:text-paper"
    >
      <span className="relative grid h-4 w-4 place-items-center">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className={`col-start-1 row-start-1 transition-[opacity,transform,filter] duration-200 ease-out ${
            isLight ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[4px]"
          }`}
        >
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className={`col-start-1 row-start-1 transition-[opacity,transform,filter] duration-200 ease-out ${
            isLight ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0"
          }`}
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      </span>
    </button>
  );
}