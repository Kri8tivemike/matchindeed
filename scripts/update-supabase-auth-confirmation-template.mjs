#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const projectRef =
  process.env.SUPABASE_PROJECT_REF ||
  process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1];
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const templatePath = path.resolve("supabase/templates/confirmation.html");

if (!projectRef) {
  console.error(
    "Missing SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL for project ref."
  );
  process.exit(1);
}

if (!accessToken) {
  console.error(
    "Missing SUPABASE_ACCESS_TOKEN. Create one at https://supabase.com/dashboard/account/tokens."
  );
  process.exit(1);
}

const html = fs.readFileSync(templatePath, "utf8");

const response = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
  {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mailer_subjects_confirmation: "Confirm your MatchIndeed account",
      mailer_templates_confirmation_content: html,
    }),
  }
);

const payload = await response.json().catch(() => ({}));

if (!response.ok) {
  console.error("Failed to update Supabase Auth confirmation template.", {
    status: response.status,
    payload,
  });
  process.exit(1);
}

console.log(
  `Updated Supabase Auth confirmation template for project ${projectRef}.`
);
