export type FlutterwaveMeta = Record<string, string | number | boolean | null>;

type CreatePaymentLinkParams = {
  txRef: string;
  amount: number;
  currency: string;
  redirectUrl: string;
  customer: {
    email: string;
    name?: string | null;
    phoneNumber?: string | null;
  };
  title: string;
  description?: string;
  meta?: FlutterwaveMeta;
};

export type FlutterwavePaymentLink = {
  link: string;
  id?: number | string;
};

export type FlutterwaveTransaction = {
  id: number;
  tx_ref: string;
  flw_ref?: string;
  amount: number;
  charged_amount?: number;
  currency: string;
  status: string;
  payment_type?: string;
  customer?: {
    email?: string;
    name?: string;
    phone_number?: string;
  };
  meta?: FlutterwaveMeta | string | null;
};

type FlutterwaveResponse<T> = {
  status: string;
  message?: string;
  data?: T;
};

const FLUTTERWAVE_API_BASE = "https://api.flutterwave.com/v3";

function getSecretKey() {
  const key = process.env.FLUTTERWAVE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("Flutterwave secret key is not configured.");
  }
  return key;
}

async function requestFlutterwave<T>(
  path: string,
  init: RequestInit = {}
): Promise<FlutterwaveResponse<T>> {
  const response = await fetch(`${FLUTTERWAVE_API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      Authorization: `Bearer ${getSecretKey()}`,
      ...(init.headers || {}),
    },
  });

  const data = (await response.json().catch(() => ({}))) as FlutterwaveResponse<T>;

  if (!response.ok || data.status === "error") {
    throw new Error(data.message || `Flutterwave request failed with HTTP ${response.status}`);
  }

  return data;
}

export async function createFlutterwavePaymentLink(
  params: CreatePaymentLinkParams
): Promise<FlutterwavePaymentLink> {
  const response = await requestFlutterwave<{ link?: string; id?: number | string }>(
    "/payments",
    {
      method: "POST",
      body: JSON.stringify({
        tx_ref: params.txRef,
        amount: params.amount,
        currency: params.currency.toUpperCase(),
        redirect_url: params.redirectUrl,
        customer: {
          email: params.customer.email,
          name: params.customer.name || undefined,
          phonenumber: params.customer.phoneNumber || undefined,
        },
        customizations: {
          title: params.title,
          description: params.description || params.title,
          logo: `${process.env.NEXT_PUBLIC_APP_URL || "https://matchindeed.com"}/favicon.ico`,
        },
        meta: params.meta || {},
      }),
    }
  );

  const link = response.data?.link;
  if (!link) {
    throw new Error("Flutterwave checkout URL unavailable.");
  }

  return { link, id: response.data?.id };
}

export async function verifyFlutterwaveTransaction(
  transactionId: string | number
): Promise<FlutterwaveTransaction> {
  const response = await requestFlutterwave<FlutterwaveTransaction>(
    `/transactions/${transactionId}/verify`
  );

  if (!response.data) {
    throw new Error("Flutterwave transaction verification returned no data.");
  }

  return response.data;
}

export function normalizeFlutterwaveMeta(
  meta: FlutterwaveTransaction["meta"]
): FlutterwaveMeta {
  if (!meta) return {};

  if (typeof meta === "string") {
    try {
      const parsed = JSON.parse(meta);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as FlutterwaveMeta)
        : {};
    } catch {
      return {};
    }
  }

  return meta;
}

export function amountToMajorUnit(amountCents: number) {
  return Number((amountCents / 100).toFixed(2));
}

export function amountToSmallestUnit(amount: number) {
  return Math.round(Number(amount || 0) * 100);
}

export function createTxRef(prefix: "wallet" | "credits" | "subscription", userId: string) {
  const random = randomUUID().replace(/-/g, "").slice(0, 18);
  return `mi-${prefix}-${userId.slice(0, 8)}-${random}`;
}
import { randomUUID } from "crypto";
