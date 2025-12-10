"use client";
import Link from "next/link";
import { ChevronRight, HelpCircle, User } from "lucide-react";

type SidebarProps = {
  active?: "profile" | "my-account" | "preference" | "appointments" | "notifications" | "subscription" | "about" | "signout" | "edit";
};

export default function Sidebar({ active }: SidebarProps) {
  const itemClass = (key: SidebarProps["active"]) =>
    `flex items-center justify-between rounded-xl px-3 py-2 ${active === key ? "bg-[#eef2ff] text-[#1f419a]" : "text-gray-700"}`;

  return (
    <aside className="flex h-full flex-col rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center gap-3 rounded-xl bg-[#eef2ff] px-3 py-2 text-[#1f419a]">
        <div className="h-9 w-9 rounded-full bg-white shadow ring-2 ring-[#1f419a] flex items-center justify-center"><User className="h-4 w-4 text-[#1f419a]"/></div>
        <div className="text-sm">
          <div className="font-medium text-gray-900">Kunle</div>
          <div className="text-gray-600">Age 43, London</div>
        </div>
      </div>
      <div className="mt-3 space-y-2 text-sm">
        <Link href="/dashboard/profile" className={itemClass("profile")}><span>My profile</span><ChevronRight className={`h-4 w-4 ${active === "profile" ? "text-[#1f419a]" : "text-gray-400"}`}/></Link>
        <Link href="/dashboard/profile/my-account" className={itemClass("my-account")}><span>My account</span><ChevronRight className={`h-4 w-4 ${active === "my-account" ? "text-[#1f419a]" : "text-gray-400"}`}/></Link>
        <Link href="/dashboard/profile/preferences" className={itemClass("preference")}><span>My preference</span><ChevronRight className={`h-4 w-4 ${active === "preference" ? "text-[#1f419a]" : "text-gray-400"}`}/></Link>
        <Link href="#" className={itemClass("appointments")}><span>Appointments</span><ChevronRight className={`h-4 w-4 ${active === "appointments" ? "text-[#1f419a]" : "text-gray-400"}`}/></Link>
        <Link href="/dashboard/profile/notifications" className={itemClass("notifications")}><span>Notifications</span><ChevronRight className={`h-4 w-4 ${active === "notifications" ? "text-[#1f419a]" : "text-gray-400"}`}/></Link>
        <Link href="/dashboard/profile/subscription" className={itemClass("subscription")}><span>My subscription</span><ChevronRight className={`h-4 w-4 ${active === "subscription" ? "text-[#1f419a]" : "text-gray-400"}`}/></Link>
        <Link href="#" className={itemClass("about")}><span>About</span><ChevronRight className="h-4 w-4 text-gray-400"/></Link>
        <Link href="#" className={itemClass("signout")}><span>Sign out</span><ChevronRight className="h-4 w-4 text-gray-400"/></Link>
      </div>
      <div className="mt-auto rounded-xl bg-white shadow ring-1 ring-black/5 p-3 text-sm text-[#1f419a] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white shadow ring-2 ring-[#1f419a]"><HelpCircle className="h-4 w-4 text-[#1f419a]"/></span>
          <div>
            <div className="font-medium">Online Help</div>
            <div className="text-xs text-gray-600">Get support anytime</div>
          </div>
        </div>
        <ChevronRight className="h-4 w-4"/>
      </div>
    </aside>
  );
}
