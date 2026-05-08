import test from "node:test";
import assert from "node:assert/strict";
import {
  getAvailableCredits,
  getSendRequestCreditCost,
  getAcceptRequestCreditCost,
  getJoinMeetingCreditCost,
} from "../../src/lib/credits/actions.ts";

test("getAvailableCredits returns 0 for missing values", () => {
  assert.equal(getAvailableCredits(null), 0);
  assert.equal(
    getAvailableCredits({ total: 0, used: 5, rollover: 0 }),
    0
  );
});

test("getAvailableCredits includes rollover and deducts used credits", () => {
  const available = getAvailableCredits({
    total: 75,
    used: 20,
    rollover: 10,
  });

  assert.equal(available, 65);
});

test("send request costs follow tier and extra charge policy", () => {
  assert.equal(getSendRequestCreditCost("basic"), 6);
  assert.equal(getSendRequestCreditCost("basic", { extraCharge: true }), 8);
  assert.equal(getSendRequestCreditCost("premium"), 10);
  assert.equal(getSendRequestCreditCost("vip"), 0);
});

test("accept request and join meeting costs match configured values", () => {
  assert.equal(getAcceptRequestCreditCost("basic"), 2);
  assert.equal(getAcceptRequestCreditCost("premium"), 6);

  assert.equal(getJoinMeetingCreditCost("premium", "group"), 8);
  assert.equal(getJoinMeetingCreditCost("premium", "one_on_one"), 12);
  assert.equal(getJoinMeetingCreditCost("vip", "one_on_one"), 0);
});
