/**
 * Cron Job: Auto-approve Reactivation Requests
 *
 * Approves reactivation requests that have been in "partner_notified" status
 * for 7+ days with no partner objection.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as reactivationTemplates from "@/lib/email/reactivation-templates";
import { sendRawHtmlEmail } from "@/lib/email";
import { getPreferredEmailRecipientName } from "@/lib/email-recipient-name";
import { validateCronAuth } from "@/lib/cron-auth";
import { reactivateUserProfile } from "@/lib/profile/reactivation";

const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const cronAuth = validateCronAuth(request);
    if (!cronAuth.authorized) {
      return NextResponse.json(
        { error: cronAuth.error || "Unauthorized" },
        { status: cronAuth.status }
      );
    }

    const nowIso = new Date().toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: pendingRequests, error: fetchError } = await supabaseService
      .from("profile_reactivation_requests")
      .select("*")
      .eq("status", "partner_notified")
      .or(`expires_at.lt.${nowIso},and(expires_at.is.null,created_at.lt.${sevenDaysAgo})`);

    if (fetchError) {
      console.error("Database error:", fetchError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    if (!pendingRequests?.length) {
      return NextResponse.json({
        success: true,
        message: "No requests to auto-approve",
        processed: 0,
      });
    }

    let successCount = 0;
    let failureCount = 0;

    for (const req of pendingRequests) {
      try {
        const { data: userData } = await supabaseService
          .from("accounts")
          .select("id, email, display_name")
          .eq("id", req.user_id)
          .single();

        const { data: partnerData } = await supabaseService
          .from("accounts")
          .select("id, email, display_name")
          .eq("id", req.matched_with_user_id)
          .single();

        if (!userData || !partnerData) {
          failureCount++;
          continue;
        }

        const { data: profiles } = await supabaseService
          .from("user_profiles")
          .select("user_id, first_name")
          .in("user_id", [req.user_id, req.matched_with_user_id]);

        const profileMap = new Map(
          ((profiles || []) as { user_id: string; first_name: string | null }[]).map(
            (profile) => [profile.user_id, profile]
          )
        );

        const { error: updateError } = await supabaseService
          .from("profile_reactivation_requests")
          .update({
            status: "approved",
            admin_decision: "approved",
            admin_notes: "Auto-approved after 7 days with no partner objection",
            updated_at: new Date().toISOString(),
          })
          .eq("id", req.id);

        if (updateError) throw updateError;

        await reactivateUserProfile(supabaseService, req.user_id);

        const userName = getPreferredEmailRecipientName({
          profileFirstName: profileMap.get(req.user_id)?.first_name,
          accountDisplayName: userData.display_name,
          email: userData.email,
          defaultValue: "User",
        });
        const partnerName = getPreferredEmailRecipientName({
          profileFirstName: profileMap.get(req.matched_with_user_id)?.first_name,
          accountDisplayName: partnerData.display_name,
          email: partnerData.email,
          defaultValue: "Your Match",
        });
        const approvalEmailHTML = reactivationTemplates.reactivationApprovedTemplate(
          userName,
          partnerName,
          "Auto-approved after 7 days with no objections from partner."
        );

        await sendRawHtmlEmail(
          userData.email,
          "Your Profile Reactivation Has Been Approved! 🎉",
          approvalEmailHTML
        );

        const partnerNotificationHTML = reactivationTemplates.reactivationApprovedPartnerNotificationTemplate(
          partnerName,
          userName
        );

        await sendRawHtmlEmail(
          partnerData.email,
          "Your Match Has Been Reactivated",
          partnerNotificationHTML
        );

        await supabaseService.from("notifications").insert([
          {
            user_id: req.user_id,
            type: "profile_reactivation_approved",
            title: "Reactivation Approved",
            message:
              "Your profile reactivation request was auto-approved after 7 days.",
            data: { request_id: req.id, decision: "approved", auto_approved: true },
          },
          {
            user_id: req.matched_with_user_id,
            type: "profile_reactivation_match_approved",
            title: "Match Reactivated",
            message: `${userName}'s profile reactivation request was approved.`,
            data: { request_id: req.id, decision: "approved", auto_approved: true },
          },
        ]);

        successCount++;
      } catch (error) {
        console.error("Error processing request:", error);
        failureCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: "Auto-approval cron job completed",
      processed: pendingRequests.length,
      approved: successCount,
      failed: failureCount,
    });
  } catch (error) {
    console.error("Cron job error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
