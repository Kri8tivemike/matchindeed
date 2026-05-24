"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clipboard,
  Gift,
  Loader2,
  Share2,
  Sparkles,
} from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import { supabase } from "@/lib/supabase";

type ReferralPayload = {
  code: string;
  referral_link: string;
  stats: {
    total_referred_users: number;
    approved_credits: number;
    pending_credits: number;
  };
  rewards: Array<{
    id: string;
    milestone: string;
    credits_awarded: number;
    status: string;
    created_at: string;
  }>;
};

function milestoneLabel(value: string) {
  if (value === "profile_preferences_completed") {
    return "Profile and preferences completed";
  }
  if (value === "first_subscription_purchased") {
    return "First subscription purchased";
  }
  return value.replace(/_/g, " ");
}

export default function ReferralsPage() {
  const [data, setData] = useState<ReferralPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const loadReferralData = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;

        const response = await fetch("/api/referrals/me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!response.ok) throw new Error("Unable to load referral details.");
        setData(await response.json());
      } catch (error) {
        console.error("[dashboard/referrals] load error:", error);
      } finally {
        setLoading(false);
      }
    };

    loadReferralData();
  }, []);

  const copyLink = async () => {
    if (!data?.referral_link) return;
    await navigator.clipboard.writeText(data.referral_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6 lg:px-8">
        <div className="hidden w-72 shrink-0 lg:block">
          <Sidebar active="referrals" />
        </div>

        <main className="min-w-0 flex-1">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Invite & Earn</h1>
              <p className="text-sm text-gray-500">
                Earn MatchIndeed credits when invited friends complete setup and subscribe.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex h-72 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-black/5">
              <Loader2 className="h-7 w-7 animate-spin text-[#1f419a]" />
            </div>
          ) : !data ? (
            <div className="rounded-xl bg-white p-8 text-center text-gray-500 shadow-sm ring-1 ring-black/5">
              Referral details are not available right now.
            </div>
          ) : (
            <div className="space-y-6">
              <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="rounded-2xl bg-[#eef2ff] p-3 text-[#1f419a]">
                      <Gift className="h-7 w-7" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Your referral code</p>
                      <h2 className="mt-1 text-3xl font-bold tracking-wide text-gray-900">
                        {data.code}
                      </h2>
                      <p className="mt-2 max-w-xl text-sm text-gray-500">
                        Share your link. You get credits after your friend completes profile
                        and preferences, then more credits after their first subscription.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={copyLink}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1f419a] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#17357f]"
                    type="button"
                  >
                    {copied ? <CheckCircle2 className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                    {copied ? "Copied" : "Copy link"}
                  </button>
                </div>

                <div className="mt-5 rounded-lg bg-gray-50 p-3 text-sm text-gray-700 ring-1 ring-gray-100">
                  {data.referral_link}
                </div>
              </section>

              <section className="grid gap-4 md:grid-cols-3">
                {[
                  ["Friends invited", data.stats.total_referred_users],
                  ["Approved credits", data.stats.approved_credits],
                  ["Pending credits", data.stats.pending_credits],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-black/5">
                    <p className="text-sm font-medium text-gray-500">{label}</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
                  </div>
                ))}
              </section>

              <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5">
                  <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                    <Sparkles className="h-5 w-5 text-[#1f419a]" />
                    How rewards work
                  </h3>
                  <div className="mt-5 space-y-4">
                    <div className="rounded-lg border border-gray-100 p-4">
                      <p className="font-semibold text-gray-900">1. Friend completes setup</p>
                      <p className="mt-1 text-sm text-gray-500">
                        Earn credits when your invited friend completes their profile and preferences.
                      </p>
                    </div>
                    <div className="rounded-lg border border-gray-100 p-4">
                      <p className="font-semibold text-gray-900">2. Friend subscribes</p>
                      <p className="mt-1 text-sm text-gray-500">
                        Earn more credits when they buy their first subscription.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Reward history</h3>
                    <Share2 className="h-5 w-5 text-gray-400" />
                  </div>
                  <div className="overflow-hidden rounded-lg border border-gray-100">
                    {data.rewards.length === 0 ? (
                      <p className="p-5 text-sm text-gray-500">No referral rewards yet.</p>
                    ) : (
                      data.rewards.slice(0, 8).map((reward) => (
                        <div
                          key={reward.id}
                          className="flex items-center justify-between border-b border-gray-100 px-4 py-3 last:border-b-0"
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {milestoneLabel(reward.milestone)}
                            </p>
                            <p className="text-xs text-gray-500">
                              {new Date(reward.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-gray-900">
                              +{reward.credits_awarded} credits
                            </p>
                            <p className="text-xs capitalize text-gray-500">
                              {reward.status.replace(/_/g, " ")}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

