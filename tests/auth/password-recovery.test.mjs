import assert from "node:assert/strict";
import test from "node:test";

import { parsePasswordRecoveryUrl } from "../../src/lib/auth/password-recovery.ts";

test("parses Supabase implicit recovery credentials", () => {
  assert.deepEqual(
    parsePasswordRecoveryUrl(
      "https://matchindeed.com/reset-password#access_token=access&refresh_token=refresh&type=recovery"
    ),
    { kind: "implicit", accessToken: "access", refreshToken: "refresh" }
  );
});

test("parses Supabase PKCE recovery codes", () => {
  assert.deepEqual(
    parsePasswordRecoveryUrl("https://matchindeed.com/reset-password?code=auth-code"),
    { kind: "pkce", code: "auth-code" }
  );
});

test("rejects incomplete, non-recovery, and malformed links", () => {
  for (const url of [
    "https://matchindeed.com/reset-password",
    "https://matchindeed.com/reset-password#access_token=access&type=recovery",
    "https://matchindeed.com/reset-password#access_token=access&refresh_token=refresh&type=signup",
    "not a URL",
  ]) {
    assert.deepEqual(parsePasswordRecoveryUrl(url), { kind: "invalid" });
  }
});
