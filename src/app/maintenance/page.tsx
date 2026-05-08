import Image from "next/image";

export default function MaintenancePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f8fc] px-5 py-10">
      <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white px-6 py-8 text-center shadow-xl shadow-slate-200/70 sm:px-10 sm:py-12">
        <div className="mx-auto mb-7 flex justify-center">
          <Image
            src="/matchindeed-logo-black-font.png"
            alt="MatchIndeed"
            width={168}
            height={42}
            priority
            style={{ width: "auto", height: "auto" }}
          />
        </div>

        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef3ff] text-[#1f419a]">
          <span className="text-2xl font-bold">!</span>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
          MatchIndeed is under maintenance
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-slate-600 sm:text-base">
          We are making important updates right now. Admin, coordinator, and
          member accounts are temporarily unavailable until maintenance is
          complete.
        </p>

        <div className="mt-8 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm text-blue-900">
          Please check back later. Thank you for your patience.
        </div>
      </section>
    </main>
  );
}
