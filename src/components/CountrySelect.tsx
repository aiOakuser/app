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
    <div ref={rootRef} className="relative w-[108px] shrink-0 sm:w-[162px]">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="flex w-full flex-col items-start rounded-2xl border border-neutral-200 bg-white px-3.5 py-2.5 text-left transition focus:outline-none focus:ring-2 focus:ring-offset-1 sm:rounded-3xl sm:px-5 sm:py-4"
        style={{ ["--tw-ring-color" as string]: accent, outlineColor: accent }}
      >
        <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 sm:text-[17px]">
          Country
        </span>
        <span className="mt-0.5 flex w-full items-center justify-between gap-1 sm:mt-1 sm:gap-1.5">
          <span className="truncate text-[15px] text-neutral-900 sm:text-[23px]">
            {value.flag} +{value.callingCode}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 20 20"
            fill="none"
            className={`h-[14px] w-[14px] shrink-0 text-neutral-500 transition-transform sm:h-[21px] sm:w-[21px] ${open ? "rotate-180" : ""}`}
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
          className="absolute z-20 mt-1.5 max-h-64 w-[260px] overflow-y-auto rounded-xl border border-neutral-200 bg-white py-1.5 shadow-lg sm:mt-2 sm:max-h-[384px] sm:w-[390px] sm:rounded-2xl sm:py-2"
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
                className="flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-[14px] hover:bg-neutral-50 sm:gap-4 sm:px-5 sm:py-3 sm:text-[21px]"
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
