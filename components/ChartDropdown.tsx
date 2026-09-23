"use client";

import { useEffect, useId, useRef, useState } from "react";

export interface ChartDropdownOption {
  value: string;
  label: string;
}

export default function ChartDropdown({
  label,
  value,
  options,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  options: ChartDropdownOption[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listId = useId();
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[selectedIndex];

  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  useEffect(() => {
    if (!open) return;
    function onOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onOutsidePointer);
    return () => document.removeEventListener("pointerdown", onOutsidePointer);
  }, [open]);

  function openAt(index: number) {
    setActiveIndex(index);
    setOpen(true);
  }

  function choose(option: ChartDropdownOption) {
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onOptionKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index + 1) % options.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index - 1 + options.length) % options.length);
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        break;
    }
  }

  return (
    <div
      ref={rootRef}
      className={`relative min-w-0 ${className}`}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${label}: ${selected?.label ?? ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => open ? setOpen(false) : openAt(selectedIndex)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openAt(selectedIndex);
          }
        }}
        className="flex w-full items-center justify-between gap-3 rounded-full bg-panel px-4 py-2 text-left text-xs font-medium text-paper transition-ui hover:bg-panel/80 sm:text-sm"
      >
        <span className="min-w-0 truncate">{selected?.label}</span>
        <svg viewBox="0 0 12 12" aria-hidden="true" className="h-3 w-3 shrink-0 text-fog">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul id={listId} role="listbox" aria-label={label} className="absolute right-0 z-30 mt-1 min-w-full overflow-hidden rounded-lg border border-edge bg-ink shadow-lg">
          {options.map((option, index) => (
            <li key={option.value} role="presentation">
              <button
                ref={(element) => { optionRefs.current[index] = element; }}
                type="button"
                role="option"
                tabIndex={index === activeIndex ? 0 : -1}
                aria-selected={option.value === value}
                onClick={() => choose(option)}
                onKeyDown={(event) => onOptionKeyDown(event, index)}
                className={`no-press flex w-full items-center justify-between gap-3 whitespace-nowrap px-3.5 py-2 text-left text-sm text-paper hover:bg-panel ${index === activeIndex ? "bg-panel" : ""} ${option.value === value ? "font-semibold" : ""}`}
              >
                <span>{option.label}</span>
                {option.value === value && <span aria-hidden="true">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
