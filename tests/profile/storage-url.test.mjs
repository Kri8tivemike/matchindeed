import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeProfileImageUrl,
  extractProfileImageStoragePath,
  extractSupabaseProjectRef,
  isOwnedProfileImageUrl,
  resolveCanonicalSupabaseOrigin,
} from "../../src/lib/photo/storage-url.ts";

const userId = "11111111-2222-3333-4444-555555555555";
const projectRef = "szmkvcifwopbnatsdcmw";
const customUrl = `https://auth.matchindeed.com/storage/v1/object/public/profile-images/${userId}/profile photo.jpg`;
const canonicalUrl = `https://${projectRef}.supabase.co/storage/v1/object/public/profile-images/${userId}/profile%20photo.jpg`;

test("extracts the project ref from a Supabase JWT", () => {
  const payload = Buffer.from(JSON.stringify({ ref: projectRef })).toString(
    "base64url"
  );
  assert.equal(extractSupabaseProjectRef(`header.${payload}.signature`), projectRef);
});

test("resolves the canonical project origin when the configured URL is custom", () => {
  const payload = Buffer.from(JSON.stringify({ ref: projectRef })).toString(
    "base64url"
  );
  assert.equal(
    resolveCanonicalSupabaseOrigin({
      supabaseUrl: "https://auth.matchindeed.com",
      serviceRoleKey: `header.${payload}.signature`,
    }),
    `https://${projectRef}.supabase.co`
  );
});

test("canonicalizes a custom-domain profile image without changing its path", () => {
  assert.equal(
    canonicalizeProfileImageUrl(customUrl, `https://${projectRef}.supabase.co`),
    canonicalUrl
  );
  assert.equal(
    extractProfileImageStoragePath(canonicalUrl),
    `${userId}/profile photo.jpg`
  );
});

test("enforces profile image ownership by storage folder", () => {
  assert.equal(isOwnedProfileImageUrl(customUrl, userId), true);
  assert.equal(
    isOwnedProfileImageUrl(customUrl, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
    false
  );
});
