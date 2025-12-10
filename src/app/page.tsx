"use client";
import Image from "next/image";
import { ChevronDown } from "lucide-react";
import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import AgeSelect from "@/components/AgeSelect";
import GooglePlacesAutocomplete from "@/components/GooglePlacesAutocomplete";

export default function Home() {
  const router = useRouter();
  const [seeking, setSeeking] = useState<string>("");
  const [ageMin, setAgeMin] = useState<number | null>(35);
  const [ageMax, setAgeMax] = useState<number | null>(45);
  const [city, setCity] = useState<string>(
    process.env.NEXT_PUBLIC_DEFAULT_CITY ?? "London, United Kingdom"
  );
  const [errors, setErrors] = useState<{ seeking?: string; age?: string; city?: string }>({});

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Reset errors
    setErrors({});

    // Validate form
    const newErrors: { seeking?: string; age?: string; city?: string } = {};
    
    if (!seeking) {
      newErrors.seeking = "Please select who you're interested in";
    }
    
    if (!ageMin || !ageMax) {
      newErrors.age = "Please select both minimum and maximum age";
    } else if (ageMin > ageMax) {
      newErrors.age = "Minimum age cannot be greater than maximum age";
    }
    
    if (!city || city.trim() === "") {
      newErrors.city = "Please enter a location";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Store search preferences in sessionStorage to use during registration
    sessionStorage.setItem("searchPreferences", JSON.stringify({
      seeking,
      ageMin,
      ageMax,
      city
    }));

    // Redirect to registration page
    router.push("/register");
  };
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#1e2a78] via-[#2a44a3] to-[#4463cf]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 text-white/90">
        <nav className="hidden gap-8 md:flex">
          <a className="border-b-2 border-white/80 pb-1" href="#">Home</a>
          <a className="hover:opacity-100 opacity-80" href="#">How It Works</a>
          <a className="hover:opacity-100 opacity-80" href="#">Pricing</a>
          <a className="hover:opacity-100 opacity-80" href="#">FAQ</a>
          <a className="hover:opacity-100 opacity-80" href="#">About Us</a>
          <a className="hover:opacity-100 opacity-80" href="#">Contact</a>
        </nav>
        <div className="flex items-center gap-3 text-xs md:text-sm text-white/80">
          <a 
            href="/login" 
            className="rounded-full border border-white/30 px-4 py-1 bg-white/5 hover:bg-white/10 transition-colors"
          >
            Login
          </a>
          <a 
            href="/register" 
            className="rounded-full border border-white/20 px-4 py-1 bg-white/10 hover:bg-white/20 transition-colors"
          >
            Sign Up
          </a>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl items-center justify-center px-6 py-12 md:py-24">
        <div className="w-full max-w-sm rounded-[28px] bg-white/95 shadow-2xl ring-1 ring-black/5 backdrop-blur-sm">
          <div className="flex items-center justify-center px-8 pt-8">
            <Image src="/matchindeed.svg" alt="Matchindeed" width={150} height={40} priority />
          </div>

          <form onSubmit={handleSubmit} className="px-8 pb-10 pt-6">
            <div className="mb-6">
              <label className="sr-only" htmlFor="seeking">Who are you interested in?</label>
              <div className="relative">
                <select
                  id="seeking"
                  value={seeking}
                  onChange={(e) => setSeeking(e.target.value)}
                  className={`w-full appearance-none border-b bg-transparent py-3 pr-8 text-gray-700 placeholder-gray-400 focus:outline-none ${
                    errors.seeking ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:border-[#1f419a]"
                  }`}
                  required
                >
                  <option value="" disabled>Who are you interested in?</option>
                  <option value="man-woman">I'm a man seeking a woman</option>
                  <option value="woman-man">I'm a woman seeking a man</option>
                  <option value="man-man">I'm a man seeking a man</option>
                  <option value="woman-woman">I'm a woman seeking a woman</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              </div>
              {errors.seeking && (
                <p className="mt-1 text-xs text-red-500">{errors.seeking}</p>
              )}
            </div>

            <div className="mb-6">
              <div className="mb-2 text-gray-800">Between Ages:</div>
              <div className="flex items-center gap-3">
                <AgeSelect value={ageMin} onChange={setAgeMin} min={18} max={100} placeholder="Min" />
                <span className="text-gray-600">and</span>
                <AgeSelect value={ageMax} onChange={setAgeMax} min={18} max={100} placeholder="Max" />
              </div>
              {errors.age && (
                <p className="mt-1 text-xs text-red-500">{errors.age}</p>
              )}
            </div>

            <div className="mb-8">
              <GooglePlacesAutocomplete value={city} onChange={(v) => setCity(v)} placeholder="Enter your city" />
              {errors.city && (
                <p className="mt-1 text-xs text-red-500">{errors.city}</p>
              )}
            </div>

            <div className="flex justify-center">
              <button
                type="submit"
                className="inline-flex h-12 items-center justify-center rounded-full bg-[#1f419a] px-6 text-white shadow-md transition-colors hover:bg-[#17357b] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                View singles
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
