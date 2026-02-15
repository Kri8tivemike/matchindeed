"use client";
import { useEffect, useRef, useState } from "react";

type Prediction = {
  description: string;
  place_id: string;
};

type Props = {
  value: string;
  onChange: (v: string, prediction?: Prediction) => void;
  placeholder?: string;
  minChars?: number;
  limit?: number;
  className?: string;
  /** Google Places types filter. Defaults to ["(cities)"] for worldwide city search.
   *  Use ["geocode"] for addresses, ["establishment"] for businesses, 
   *  or undefined/[] for no restriction (broadest results). */
  types?: string[];
};

type GoogleAutocompleteService = {
  getPlacePredictions: (
    request: { input: string; types?: string[] } & Record<string, unknown>,
    callback: (preds: Array<{ description: string; place_id: string }>) => void
  ) => void;
};

type GooglePlaces = {
  AutocompleteService: new () => GoogleAutocompleteService;
  AutocompleteSessionToken: new () => object;
};

type GoogleMaps = {
  maps: {
    places: GooglePlaces;
    LatLngBounds: new (sw?: unknown, ne?: unknown) => unknown;
    LatLng: new (lat: number, lng: number) => unknown;
  };
};

let mapsPromise: Promise<void> | null = null;

function loadMaps() {
  if (typeof window === "undefined") return Promise.resolve();
  const g = (window as unknown as { google?: GoogleMaps }).google;
  if (g && g.maps) return Promise.resolve();
  if (mapsPromise) return mapsPromise;
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  
  if (!key) {
    console.error("Google Maps API key is missing. Please set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in your environment variables.");
    return Promise.reject(new Error("Google Maps API key is missing"));
  }
  
  const src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
  mapsPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => {
      // Verify Google Maps is actually loaded
      const google = (window as unknown as { google?: GoogleMaps }).google;
      if (google?.maps?.places) {
        resolve();
      } else {
        reject(new Error("Google Maps loaded but Places API not available"));
      }
    };
    s.onerror = (error) => {
      console.error("Failed to load Google Maps script:", error);
      reject(new Error("failed to load maps"));
    };
    document.head.appendChild(s);
  });
  return mapsPromise;
}

export default function GooglePlacesAutocomplete({ value, onChange, placeholder = "Enter your city", minChars = 2, limit = 8, className = "", types }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Prediction[]>([]);
  const [highlight, setHighlight] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const tokenRef = useRef<object | null>(null);

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

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < minChars) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      loadMaps()
        .then(() => {
          const g = (window as unknown as { google?: GoogleMaps }).google;
          if (!g?.maps?.places) {
            console.warn("Google Maps Places API not loaded");
            return;
          }
          if (!tokenRef.current) tokenRef.current = new g.maps.places.AutocompleteSessionToken();
          const svc: GoogleAutocompleteService = new g.maps.places.AutocompleteService();
          
          // Determine the types filter for autocomplete
          // Default to geocode for neighborhoods, suburbs, cities, and addresses worldwide
          // (cities) only returns locality-level results and excludes neighborhoods like "Dopemu, Lagos"
          let typesProp: string[] | undefined;
          
          if (types && types.length > 0) {
            // Use the explicit types passed via prop
            typesProp = types;
          } else {
            // Default: use geocode so neighborhoods, areas, and addresses all match
            // e.g. "Dopemu, Lagos", "Ikeja, Lagos", "Manchester, UK" all work
            typesProp = ["geocode"];
          }

          // Build request object - NO country restrictions to allow international suggestions
          const request: { input: string; types?: string[] } & Record<string, unknown> = {
            input: q,
            types: typesProp,
            // No componentRestrictions — allows all countries
            // No locationBias — allows suggestions from anywhere in the world
          };
          
          svc.getPlacePredictions(
            request,
            (preds: any, status: any) => {
              if (ctrl.signal.aborted) return;
              if (status !== "OK" && status !== "ZERO_RESULTS") {
                console.warn("Google Places API status:", status, "for query:", q);
              }
              const arr = Array.isArray(preds) 
                ? preds.slice(0, limit).map((p: any) => ({ description: p.description, place_id: p.place_id })) 
                : [];
              setResults(arr);
            }
          );
        })
        .catch((error) => {
          console.error("Error loading Google Maps:", error);
        });
    }, 250);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [open, query, minChars, limit]);

  const commit = (v: string, p?: Prediction) => {
    onChange(v, p);
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
            setHighlight((h) => Math.min(h + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && highlight >= 0) {
            e.preventDefault();
            const r = results[highlight];
            commit(r.description, r);
          }
        }}
        placeholder={placeholder}
        className={className || "w-full border-b border-gray-300 bg-transparent py-3 text-gray-700 placeholder-gray-400 focus:border-[#1f419a] focus:outline-none"}
      />
      {open && query.trim().length >= minChars && (
        <div className="absolute z-30 mt-2 w-full rounded-xl bg-white shadow-2xl ring-1 ring-black/5">
          <div className="px-3 py-2 text-xs font-semibold text-gray-500">Suggestions</div>
          <ul role="listbox" className="max-h-56 overflow-auto py-1">
            {results.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-500">No matches</li>
            )}
            {results.map((o, idx) => (
              <li key={o.place_id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === o.description}
                  onMouseEnter={() => setHighlight(idx)}
                  onClick={() => commit(o.description, o)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-sm ${
                    highlight === idx ? "bg-gray-100" : ""
                  }`}
                >
                  <span className="font-medium">{o.description.split(", ")[0]}</span>
                  <span className="text-gray-600">{o.description.replace(o.description.split(", ")[0], "").replace(/^,\s*/, "")}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="px-3 pb-2 text-[10px] text-gray-400">Powered by Google</div>
        </div>
      )}
    </div>
  );
}
