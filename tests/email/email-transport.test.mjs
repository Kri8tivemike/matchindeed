import test from "node:test";
import assert from "node:assert/strict";
import { deliverEmail } from "../../src/lib/email/transport.ts";

const message = { from: "MatchIndeed <noreply@matchindeed.com>", to: "test@example.com", subject: "Test", html: "<p>Test</p>" };

test("transport retries a transient failure with one stable idempotency key", async () => {
  process.env.RESEND_API_KEY = "test-key";
  const keys = [];
  let calls = 0;
  const result = await deliverEmail(message, {
    idempotencyKey: "test/stable",
    sleep: async () => {},
    fetch: async (_url, options) => {
      calls++;
      keys.push(options.headers["Idempotency-Key"]);
      return new Response(calls === 1
        ? JSON.stringify({ message: "temporary" })
        : JSON.stringify({ id: "message-id" }), {
        status: calls === 1 ? 503 : 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  assert.deepEqual(keys, ["test/stable", "test/stable"]);
  assert.deepEqual(result, { success: true, messageId: "message-id" });
});

test("transport does not retry permanent provider errors", async () => {
  process.env.RESEND_API_KEY = "test-key";
  let calls = 0;
  const result = await deliverEmail(message, {
    sleep: async () => {},
    fetch: async () => {
      calls++;
      return new Response(JSON.stringify({ message: "invalid recipient" }), {
        status: 422, headers: { "Content-Type": "application/json" },
      });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.success, false);
  assert.equal(result.error, "invalid recipient");
});

test("production reports missing email credentials as a failure", async () => {
  const previousKey = process.env.RESEND_API_KEY;
  const previousEnvironment = process.env.NODE_ENV;
  delete process.env.RESEND_API_KEY;
  process.env.NODE_ENV = "production";
  const result = await deliverEmail(message);
  if (previousKey) process.env.RESEND_API_KEY = previousKey;
  else delete process.env.RESEND_API_KEY;
  if (previousEnvironment) process.env.NODE_ENV = previousEnvironment;
  else delete process.env.NODE_ENV;
  assert.equal(result.success, false);
  assert.match(result.error, /not configured/);
});
