import test from "node:test";
import assert from "node:assert/strict";
import {
  getLookingForFromGenders,
  getTargetGenderFromLookingFor,
  matchesPartnerGenderPreference,
  normalizeLookingForOption,
} from "../../src/lib/matching/interest-preference.ts";

test("normalizeLookingForOption accepts canonical and token values", () => {
  assert.equal(
    normalizeLookingForOption("I'm a man seeking a woman"),
    "I'm a man seeking a woman"
  );
  assert.equal(
    normalizeLookingForOption("woman_seeking_man"),
    "I'm a woman seeking a man"
  );
});

test("getTargetGenderFromLookingFor resolves expected partner gender", () => {
  assert.equal(getTargetGenderFromLookingFor("I'm a man seeking a man"), "male");
  assert.equal(
    getTargetGenderFromLookingFor("I'm a woman seeking a woman"),
    "female"
  );
});

test("getLookingForFromGenders maps requester + target correctly", () => {
  assert.equal(
    getLookingForFromGenders({
      requesterGender: "female",
      targetGender: "male",
    }),
    "I'm a woman seeking a man"
  );
});

test("matchesPartnerGenderPreference enforces partner gender when set", () => {
  assert.equal(matchesPartnerGenderPreference("female", "female"), true);
  assert.equal(matchesPartnerGenderPreference("male", "female"), false);
  assert.equal(matchesPartnerGenderPreference("other", "female"), false);
});
