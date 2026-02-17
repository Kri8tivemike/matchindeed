/**
 * Cron Job: Auto-approve Reactivation Requests
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import * as reactivationTemplates from "@/lib/email/reactivation-templates";
import { sendEmail } from "@/lib/email";

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

    console.warn("CRON_SECRET not set - development mode");
    return true;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  try {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: pendingRequests, error: fetchError } = await supabase
      .from("profile_reactivation_requests")
      .select("*")
      .eq("status", "partner_notified")
      .lt("created_at", sevenDaysAgo.toISOString());

    if (fetchError) {
      console.error("Database error:", fetchError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

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
        const { data: userData } = await supabase
          .from("accounts")
          .select("id, email, display_name")
          .eq("id", req.user_id)
          .single();

        const { data: partnerData } = await supabase
          .from("accounts")
          .select("id, email, display_name")
          .eq("id", req.matched_with_user_id)
          .single();

          failureCount++;
          continue;
        }

        const { error: updateError } = await supabase
          .from("profile_reactivation_requests")
          .update({
            status: "approved",
            admin_decision: "approved",
            admin_notes: "Auto-approved after 7 days with no partner objection",
            updated_at: new Date().toISOString(),
          })
          .eq("id", req.id);

        if (updateError) throw updateError;

        const { error: activateError } = await supabase
          .from("accounts")
          .update({ account_status: "active" })
          .eq("id", req.user_id);

        if (activateError) throw activateError;

        const userName = userData.display_name || userData.email;
        const partnerName = partnerData.display_name || partnerData.email;
        const approvalEmailHTML = reactivationTemplates.reactivationApprovedTemplate(
          userName,
          partnerName,
          "Auto-approved after 7 days with no objections from partner."
        );

        await sendEmail({
          to: userData.email,
          subject: "Your Profile Reactivation Has Been Approved! 🎉",
          html: approvalEmailHTML,
        });

        const partnerNotificationHTML = reactivationTemplates.reactivationApprovedPartnerNotificationTemplate(
          partnerName,
          userName
        );

        await sendEmail({
          to: partnerData.email,
          subject: "Your Match Has Been Reactivated",
          html: partnerNotificationHTML,
        });

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
