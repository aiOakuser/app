"use client";

import { useEffect, useRef, useState } from "react";
import type { CountryOption } from "@/lib/phone";

export function CountrySelect({
  options,
  value,
  onChange,
  accent,
}: {
  options: CountryOption[];
  value: CountryOption;
  onChange: (country: CountryOption) => void;
  accent: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={rootRef} className="relative w-[162px] shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="flex w-full flex-col items-start rounded-3xl border border-neutral-200 bg-white px-5 py-4 text-left transition focus:outline-none focus:ring-2 focus:ring-offset-1"
        style={{ ["--tw-ring-color" as string]: accent, outlineColor: accent }}
      >
        <span className="text-[17px] font-medium uppercase tracking-wide text-neutral-500">
          Country
        </span>
        <span className="mt-1 flex w-full items-center justify-between gap-1.5">
          <span className="truncate text-[23px] text-neutral-900">
            {value.flag} +{value.callingCode}
          </span>
          <svg
            width="21"
            height="21"
            viewBox="0 0 20 20"
            fill="none"
            className={`shrink-0 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path
              d="M5 7.5l5 5 5-5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-20 mt-2 max-h-[384px] w-[390px] overflow-y-auto rounded-2xl border border-neutral-200 bg-white py-2 shadow-lg"
        >
          {options.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                role="option"
                aria-selected={c.code === value.code}
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-4 px-5 py-3 text-left text-[21px] hover:bg-neutral-50"
              >
                <span className="truncate">
                  {c.flag} {c.name}
                </span>
                <span className="shrink-0 text-neutral-500">+{c.callingCode}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
