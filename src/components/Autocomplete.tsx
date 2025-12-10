"use client";
import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
};

export default function Autocomplete({ options, value, onChange, placeholder = "Enter value" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    return base.slice(0, 50);
  }, [options, query]);

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

  const commit = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
    setHighlight(-1);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        ref={inputRef}
        value={open ? query : value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && highlight >= 0) {
            e.preventDefault();
            commit(filtered[highlight]);
          }
        }}
        placeholder={placeholder}
        className="w-full border-b border-gray-300 bg-transparent py-3 text-gray-700 placeholder-gray-400 focus:border-[#1f419a] focus:outline-none"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-30 mt-2 w-full rounded-xl bg-white shadow-2xl ring-1 ring-black/5">
          <div className="px-3 py-2 text-xs font-semibold text-gray-500">Suggestions</div>
          <ul role="listbox" className="max-h-56 overflow-auto py-1">
            {filtered.map((o, idx) => (
              <li key={o}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === o}
                  onMouseEnter={() => setHighlight(idx)}
                  onClick={() => commit(o)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-sm ${
                    highlight === idx ? "bg-gray-100" : ""
                  }`}
                >
                  <span>{o}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

