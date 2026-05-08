import crypto from "crypto";

const TOKEN_VERSION = 1;
const TOKEN_TTL_SECONDS = 24 * 60 * 60;

type VerificationTokenPayload = {
  v: number;
  userId: string;
  email: string;
  code: string;
  exp: number;
};

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getSigningSecret() {
  const secret =
    process.env.EMAIL_VERIFICATION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error("Missing email verification signing secret.");
  }

  return secret;
}

function signPayload(payload: string) {
  return crypto
    .createHmac("sha256", getSigningSecret())
    .update(payload)
    .digest("base64url");
}

function timingSafeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function createEmailVerificationCode() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashEmailVerificationCode(code: string) {
  // Truncated to 6 chars to fit the current VARCHAR(6) DB column.
  // Run migration 20260508000000_widen_email_verification_code_column.sql
  // in Supabase to permanently widen the column to TEXT.
  return crypto.createHash("sha256").update(code).digest("hex").substring(0, 6);
}

export function createEmailVerificationToken({
  userId,
  email,
  code,
}: {
  userId: string;
  email: string;
  code: string;
}) {
  const payload: VerificationTokenPayload = {
    v: TOKEN_VERSION,
    userId,
    email,
    code,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifyEmailVerificationToken(token: string) {
  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    throw new Error("Invalid verification link.");
  }

  const expectedSignature = signPayload(encodedPayload);
  if (!timingSafeEqual(signature, expectedSignature)) {
    throw new Error("Invalid verification link.");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<VerificationTokenPayload>;
  if (
    payload.v !== TOKEN_VERSION ||
    !payload.userId ||
    !payload.email ||
    !payload.code ||
    !payload.exp
  ) {
    throw new Error("Invalid verification link.");
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Verification link expired.");
  }

  return payload as VerificationTokenPayload;
}
