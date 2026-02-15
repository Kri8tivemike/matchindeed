/**
 * Dashboard Loading Skeleton
 * --------------------------
 * Shown during route transitions within /dashboard/*.
 * Mirrors the typical dashboard layout (header + sidebar + content)
 * with animated pulse placeholders for immediate visual feedback.
 */

export default function Loading() {
  return (
    <div className="min-h-screen w-full bg-gray-50 animate-in fade-in duration-200">
      {/* Header skeleton */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="h-9 w-36 rounded-lg bg-gray-200 animate-pulse" />
          <div className="h-9 w-9 rounded-full bg-gray-200 animate-pulse" />
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        {/* Sidebar skeleton */}
        <aside className="hidden md:block w-56 flex-shrink-0 space-y-2">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 space-y-3">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-5 w-5 rounded bg-gray-200 animate-pulse" />
                <div
                  className="h-4 rounded bg-gray-200 animate-pulse"
                  style={{ width: `${60 + Math.random() * 40}%` }}
                />
              </div>
            ))}
          </div>
        </aside>

        {/* Content skeleton */}
        <section className="min-w-0 flex-1 space-y-6">
          {/* Welcome banner skeleton */}
          <div className="rounded-3xl bg-gradient-to-r from-gray-200 to-gray-300 p-6 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-white/30" />
              <div className="space-y-2 flex-1">
                <div className="h-6 w-48 rounded bg-white/30" />
                <div className="h-4 w-64 rounded bg-white/20" />
              </div>
            </div>
          </div>

          {/* Stat cards skeleton */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 animate-pulse"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gray-200" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-6 w-10 rounded bg-gray-200" />
                    <div className="h-3 w-14 rounded bg-gray-100" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Content cards skeleton */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {[...Array(2)].map((_, i) => (
              <div
                key={i}
                className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 animate-pulse"
              >
                <div className="h-5 w-32 rounded bg-gray-200 mb-4" />
                <div className="space-y-3">
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-gray-200" />
                      <div className="space-y-1.5 flex-1">
                        <div className="h-4 w-3/4 rounded bg-gray-200" />
                        <div className="h-3 w-1/2 rounded bg-gray-100" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
