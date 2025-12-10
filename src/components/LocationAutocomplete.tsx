"use client";
import { useEffect, useMemo, useRef, useState } from "react";

type Place = {
  display_name: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
};

type Props = {
  value: string;
  onChange: (v: string, place?: Place) => void;
  placeholder?: string;
  minChars?: number;
  limit?: number;
};

export default function LocationAutocomplete({ value, onChange, placeholder = "Enter your city", minChars = 2, limit = Number(process.env.NEXT_PUBLIC_GEOCODER_LIMIT ?? 10) }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [highlight, setHighlight] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const endpoint = process.env.NEXT_PUBLIC_GEOCODER_URL ?? "https://nominatim.openstreetmap.org/search";

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < minChars) {
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      const url = `${endpoint}?format=jsonv2&addressdetails=1&limit=${limit}&q=${encodeURIComponent(q)}`;
      fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } })
        .then((r) => r.json())
        .then((data: Place[]) => setResults(data))
        .catch(() => {});
    }, 250);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [open, query, endpoint, limit, minChars]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const commit = (v: string, place?: Place) => {
    onChange(v, place);
    setOpen(false);
    setQuery("");
    setHighlight(-1);
  };

  const lines = useMemo(() => {
    return results.map((p) => {
      const a = p.address ?? {};
      const city = a.city || a.town || a.village || a.county || "";
      const state = a.state || a.region || "";
      const country = a.country || "";
      const summary = [city, state, country].filter(Boolean).join(", ");
      return { summary, place: p };
    });
  }, [results]);

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
            setHighlight((h) => Math.min(h + 1, lines.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && highlight >= 0) {
            e.preventDefault();
            const l = lines[highlight];
            commit(l.summary, l.place);
          }
        }}
        placeholder={placeholder}
        className="w-full border-b border-gray-300 bg-transparent py-3 text-gray-700 placeholder-gray-400 focus:border-[#1f419a] focus:outline-none"
      />
      {open && query.trim().length >= minChars && (
        <div className="absolute z-30 mt-2 w-full rounded-xl bg-white shadow-2xl ring-1 ring-black/5">
          <div className="px-3 py-2 text-xs font-semibold text-gray-500">Suggestions</div>
          <ul role="listbox" className="max-h-56 overflow-auto py-1">
            {lines.length === 0 && query.length >= minChars && (
              <li className="px-3 py-2 text-sm text-gray-500">No matches</li>
            )}
            {lines.map((item, idx) => (
              <li key={idx}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === item.summary}
                  onMouseEnter={() => setHighlight(idx)}
                  onClick={() => commit(item.summary, item.place)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-sm ${
                    highlight === idx ? "bg-gray-100" : ""
                  }`}
                >
                  <span className="font-medium">{item.summary.split(", ")[0]}</span>
                  <span className="text-gray-600">{item.summary.replace(item.summary.split(", ")[0], "").replace(/^,\s*/, "")}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="px-3 pb-2 text-[10px] text-gray-400">© OpenStreetMap contributors</div>
        </div>
      )}
    </div>
  );
}
