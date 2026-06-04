import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateMeetingRequestRules,
  STANDARD_PRIVATE_MEETING_MONTHLY_LIMIT,
} from "../../src/lib/subscription/meeting-rules.ts";

test("Basic tier can only request group meetings", () => {
  const result = evaluateMeetingRequestRules({
    requesterTier: "basic",
    targetTier: "basic",
    meetingType: "one_on_one",
  });

  assert.equal(result.allowed, false);
  assert.equal(result.code, "basic_group_only");
});

test("Basic tier group meetings are restricted to Basic targets", () => {
  const result = evaluateMeetingRequestRules({
    requesterTier: "basic",
    targetTier: "standard",
    meetingType: "group",
  });

  assert.equal(result.allowed, false);
  assert.equal(result.code, "basic_target_restricted");
  assert.equal(
    result.message,
    "Basic accounts can only request meetings with Basic users."
  );
});

test("starter-trial accounts use free-plan wording for Basic-tier restrictions", () => {
  const result = evaluateMeetingRequestRules({
    requesterTier: "basic",
    targetTier: "standard",
    meetingType: "group",
    requesterPlanLabel: "Free plan",
  });

  assert.equal(result.allowed, false);
  assert.equal(result.code, "basic_target_restricted");
  assert.equal(
    result.message,
    "Free plan accounts can only request meetings with Basic users."
  );
});

test("Standard private meetings cannot target Premium/VIP", () => {
  const result = evaluateMeetingRequestRules({
    requesterTier: "standard",
    targetTier: "premium",
    meetingType: "one_on_one",
    standardPrivateMeetingsThisMonth: 0,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.code, "standard_private_target_restricted");
});

test("Standard private meetings enforce monthly limit", () => {
  const result = evaluateMeetingRequestRules({
    requesterTier: "standard",
    targetTier: "standard",
    meetingType: "one_on_one",
    standardPrivateMeetingsThisMonth: STANDARD_PRIVATE_MEETING_MONTHLY_LIMIT,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.code, "standard_private_limit_reached");
  assert.equal(result.limit, STANDARD_PRIVATE_MEETING_MONTHLY_LIMIT);
});

test("Premium one-on-one request cannot target VIP users", () => {
  const result = evaluateMeetingRequestRules({
    requesterTier: "premium",
    targetTier: "vip",
    meetingType: "one_on_one",
  });

  assert.equal(result.allowed, false);
  assert.equal(result.code, "premium_private_target_restricted");
  assert.equal(result.requiresUpgrade, true);
  assert.equal(result.normalizedRequesterTier, "premium");
  assert.equal(result.normalizedMeetingType, "one_on_one");
});
