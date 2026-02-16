"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

type Props = {
  value: number | null;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  placeholder?: string;
};

export default function AgeSelect({ value, onChange, min = 18, max = 100, placeholder = "Select age" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const ages = useMemo(() => Array.from({ length: max - min + 1 }, (_, i) => min + i), [min, max]);

  const groups = useMemo(() => {
    const ranges: Array<{ label: string; start: number; end: number }> = [
      { label: "18–29", start: 18, end: 29 },
      { label: "30–39", start: 30, end: 39 },
      { label: "40–49", start: 40, end: 49 },
      { label: "50–59", start: 50, end: 59 },
      { label: "60–69", start: 60, end: 69 },
      { label: "70–79", start: 70, end: 79 },
      { label: "80–89", start: 80, end: 89 },
      { label: "90+", start: 90, end: max },
    ];
    return ranges.map((r) => ({
      label: r.label,
      items: ages.filter((n) => n >= r.start && n <= r.end),
    }));
  }, [ages, max]);

  const filteredGroups = useMemo(() => {
    if (!query) return groups;
    const q = query.toLowerCase();
    return groups
      .map((g) => ({ label: g.label, items: g.items.filter((n) => String(n).includes(q)) }))
      .filter((g) => g.items.length > 0);
  }, [groups, query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-28 items-center justify-between border-b border-gray-300 bg-transparent py-2 text-gray-700 focus:border-[#1f419a] focus:outline-none"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{value ?? placeholder}</span>
        <ChevronDown className="h-4 w-4 text-gray-500" />
      </button>
      {open && (
        <div className="absolute z-30 mt-2 w-56 rounded-xl bg-white p-2 shadow-2xl ring-1 ring-black/5">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search age"
            className="mb-2 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-[#1f419a] focus:outline-none"
          />
          <div className="max-h-56 overflow-auto">
            {filteredGroups.map((g) => (
              <div key={g.label} className="pb-2">
                <div className="px-2 py-1 text-xs font-semibold text-gray-500">{g.label}</div>
                <div className="grid grid-cols-4 gap-1 px-2">
                  {g.items.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        onChange(n);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={`rounded-md px-2 py-1 text-sm ${
                        value === n ? "bg-[#1f419a] text-white" : "hover:bg-gray-100"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

