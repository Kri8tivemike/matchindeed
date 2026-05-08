/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function parseEnvFile(filePath, target) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in target)) target[key] = value;
  }
}

function fail(message, extra) {
  console.error(message);
  if (extra) console.error(extra);
  process.exit(1);
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function run() {
  const cwd = process.cwd();
  const env = { ...process.env };
  parseEnvFile(path.join(cwd, ".env"), env);
  parseEnvFile(path.join(cwd, ".env.local"), env);

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    fail("Missing Supabase env vars (url/service/anon).");
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const testId = Date.now().toString(36);
  const email = `phase5-host-${testId}@example.com`;
  const password = `TmpP@ss-${Math.random().toString(36).slice(2)}A1!`;

  let authUserId = null;
  let hostProfileId = null;
  let meetingId = null;

  try {
    const { data: accounts, error: accountsError } = await admin
      .from("accounts")
      .select("id")
      .limit(2);
    if (accountsError || !accounts || accounts.length < 2) {
      fail("Need at least 2 existing accounts for host meeting test.", accountsError);
    }

    const meetingHostAccountId = accounts[0].id;
    const guestAccountId = accounts[1].id;

    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) {
      fail("Failed to create test auth user.", created.error);
    }
    authUserId = created.data.user.id;

    const { data: hostProfile, error: hostProfileError } = await admin
      .from("host_profiles")
      .insert({
        user_id: authUserId,
        host_type: "vip",
        commission_rate: 10,
        is_active: true,
        two_fa_enabled: false,
      })
      .select("id")
      .single();
    if (hostProfileError || !hostProfile) {
      fail("Failed to create host profile.", hostProfileError);
    }
    hostProfileId = hostProfile.id;

    const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data: meeting, error: meetingError } = await admin
      .from("meetings")
      .insert({
        host_id: meetingHostAccountId,
        type: "one_on_one",
        status: "confirmed",
        scheduled_at: scheduledAt,
      })
      .select("id")
      .single();
    if (meetingError || !meeting) {
      fail("Failed to create test meeting.", meetingError);
    }
    meetingId = meeting.id;

    const { error: participantsError } = await admin
      .from("meeting_participants")
      .insert([
        {
          meeting_id: meetingId,
          user_id: meetingHostAccountId,
          role: "host",
          response: "accepted",
          responded_at: new Date().toISOString(),
        },
        {
          meeting_id: meetingId,
          user_id: guestAccountId,
          role: "guest",
          response: "accepted",
          responded_at: new Date().toISOString(),
        },
      ]);
    if (participantsError) {
      fail("Failed to create meeting participants.", participantsError);
    }

    const { error: hostMeetingError } = await admin.from("host_meetings").insert({
      host_id: hostProfileId,
      meeting_id: meetingId,
      report_submitted: false,
    });
    if (hostMeetingError) {
      fail("Failed to create host_meetings row.", hostMeetingError);
    }

    const signIn = await anon.auth.signInWithPassword({ email, password });
    if (signIn.error || !signIn.data.session?.access_token) {
      fail("Failed to sign in test host user.", signIn.error);
    }
    const token = signIn.data.session.access_token;

    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const meetingsRes = await fetch("https://matchindeed.com/api/host/meetings", {
      headers,
    });
    const meetingsBody = await safeJson(meetingsRes);
    if (meetingsRes.status !== 200) {
      fail("GET /api/host/meetings failed.", { status: meetingsRes.status, body: meetingsBody });
    }

    const hasMeeting =
      Array.isArray(meetingsBody?.meetings) &&
      meetingsBody.meetings.some((m) => m.meeting_id === meetingId);
    if (!hasMeeting) {
      fail("GET /api/host/meetings did not include assigned meeting.");
    }

    const postMeetingRes = await fetch("https://matchindeed.com/api/host/meetings", {
      method: "POST",
      headers,
      body: JSON.stringify({
        meeting_id: meetingId,
        success_marked: true,
        notes: "Phase 5 host endpoint smoke test",
        video_recording_url: "https://example.com/recordings/test.mp4",
      }),
    });
    const postMeetingBody = await safeJson(postMeetingRes);
    if (postMeetingRes.status !== 200 || !postMeetingBody?.success) {
      fail("POST /api/host/meetings failed.", {
        status: postMeetingRes.status,
        body: postMeetingBody,
      });
    }

    const postReportRes = await fetch("https://matchindeed.com/api/host/report", {
      method: "POST",
      headers,
      body: JSON.stringify({
        report_type: "meeting_issue",
        meeting_id: meetingId,
        title: "E2E host report test",
        description: "Automated host report verification for deployed phase 5 endpoints.",
        severity: "medium",
      }),
    });
    const postReportBody = await safeJson(postReportRes);
    if (postReportRes.status !== 201 || !postReportBody?.id) {
      fail("POST /api/host/report failed.", {
        status: postReportRes.status,
        body: postReportBody,
      });
    }

    const { data: updatedHostMeeting, error: verifyHostMeetingError } = await admin
      .from("host_meetings")
      .select("report_submitted, success_marked, notes, video_recording_url")
      .eq("host_id", hostProfileId)
      .eq("meeting_id", meetingId)
      .single();
    if (verifyHostMeetingError || !updatedHostMeeting) {
      fail("Failed to verify host_meetings update.", verifyHostMeetingError);
    }
    if (
      updatedHostMeeting.report_submitted !== true ||
      updatedHostMeeting.success_marked !== true
    ) {
      fail("host_meetings update verification failed.", updatedHostMeeting);
    }

    const { data: reportRow, error: verifyReportError } = await admin
      .from("host_reports")
      .select("id, status, report_type, title")
      .eq("host_id", hostProfileId)
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (verifyReportError || !reportRow) {
      fail("Failed to verify host_reports insert.", verifyReportError);
    }

    console.log(
      JSON.stringify(
        {
          success: true,
          host_meetings_status: meetingsRes.status,
          host_meetings_count: meetingsBody?.count ?? null,
          post_host_meeting_status: postMeetingRes.status,
          post_host_report_status: postReportRes.status,
          verified_host_report_id: reportRow.id,
        },
        null,
        2
      )
    );
  } finally {
    if (hostProfileId) {
      await admin.from("host_reports").delete().eq("host_id", hostProfileId);
      await admin.from("host_meetings").delete().eq("host_id", hostProfileId);
      await admin.from("host_profiles").delete().eq("id", hostProfileId);
    }
    if (meetingId) {
      await admin.from("meeting_participants").delete().eq("meeting_id", meetingId);
      await admin.from("meetings").delete().eq("id", meetingId);
    }
    if (authUserId) {
      await admin.auth.admin.deleteUser(authUserId);
    }
  }
}

run().catch((err) => fail("Host E2E script failed.", err));
