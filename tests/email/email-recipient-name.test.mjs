import test from "node:test";
import assert from "node:assert/strict";

import { getPreferredEmailRecipientName } from "../../src/lib/email-recipient-name.ts";

test("prefers the saved profile first name over older account or auth names", () => {
  const result = getPreferredEmailRecipientName({
    profileFirstName: "Taoma",
    authGivenName: "Michael",
    accountDisplayName: "Michael Johnson",
    email: "michael@gmail.com",
  });

  assert.equal(result, "Taoma");
});

test("falls back to the provider given name when profile first name is missing", () => {
  const result = getPreferredEmailRecipientName({
    authGivenName: "Nailat",
    authFullName: "Nailat Adesina",
    email: "nailat@gmail.com",
  });

  assert.equal(result, "Nailat");
});

test("uses the first token of a full display name for greetings", () => {
  const result = getPreferredEmailRecipientName({
    accountDisplayName: "Odunola Yusuf",
    email: "odunola@gmail.com",
  });

  assert.equal(result, "Odunola");
});

test("falls back to a neutral greeting when no usable first name exists", () => {
  const result = getPreferredEmailRecipientName({
    email: "12345@gmail.com",
  });

  assert.equal(result, "there");
});
