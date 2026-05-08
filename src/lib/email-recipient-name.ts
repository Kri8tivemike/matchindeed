import { isValidFirstName, normalizeFirstName } from "@/lib/name";

type EmailRecipientNameOptions = {
  profileFirstName?: string | null;
  authGivenName?: string | null;
  authFirstName?: string | null;
  accountDisplayName?: string | null;
  authDisplayName?: string | null;
  authFullName?: string | null;
  email?: string | null;
  defaultValue?: string;
};

function normalizeCandidate(value: string | null | undefined) {
  if (typeof value !== "string") return "";
  return normalizeFirstName(value);
}

function getValidFirstName(value: string | null | undefined) {
  const normalized = normalizeCandidate(value);
  return isValidFirstName(normalized) ? normalized : "";
}

function getFirstToken(value: string | null | undefined) {
  const normalized = normalizeCandidate(value);
  if (!normalized) return "";
  const [firstToken = ""] = normalized.split(" ");
  return getValidFirstName(firstToken);
}

export function getPreferredEmailRecipientName(
  options: EmailRecipientNameOptions
) {
  const defaultValue = options.defaultValue || "there";

  return (
    getValidFirstName(options.profileFirstName) ||
    getValidFirstName(options.authGivenName) ||
    getValidFirstName(options.authFirstName) ||
    getFirstToken(options.accountDisplayName) ||
    getFirstToken(options.authDisplayName) ||
    getFirstToken(options.authFullName) ||
    getFirstToken(
      typeof options.email === "string" ? options.email.split("@")[0] : ""
    ) ||
    defaultValue
  );
}
