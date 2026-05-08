import test from "node:test";
import assert from "node:assert/strict";
import { resolvePostLoginRedirect } from "../../src/lib/user-progress.ts";

test("completed users ignore stale profile edit next redirects", () => {
  const redirectPath = resolvePostLoginRedirect(
    {
      profile_completed: true,
      preferences_completed: true,
    },
    "/dashboard/profile/edit"
  );

  assert.equal(redirectPath, "/dashboard/discover");
});

test("incomplete users still get routed into onboarding regardless of next", () => {
  assert.equal(
    resolvePostLoginRedirect(
      {
        profile_completed: false,
        preferences_completed: false,
      },
      "/dashboard/discover"
    ),
    "/dashboard/profile/edit"
  );

  assert.equal(
    resolvePostLoginRedirect(
      {
        profile_completed: true,
        preferences_completed: false,
      },
      "/dashboard/discover"
    ),
    "/dashboard/profile/preferences"
  );
});

test("completed users can still continue to non-onboarding next destinations", () => {
  const redirectPath = resolvePostLoginRedirect(
    {
      profile_completed: true,
      preferences_completed: true,
    },
    "/dashboard/messages"
  );

  assert.equal(redirectPath, "/dashboard/messages");
});
