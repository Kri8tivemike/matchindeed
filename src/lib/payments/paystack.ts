import { randomUUID } from "crypto";

export type PaystackPaymentType =
  | "wallet_topup"
  | "credit_purchase"
  | "subscription";

export type PaystackReference =
  | {
      paymentType: "wallet_topup";
      currency: string;
      amountCents: number;
    }
  | {
      paymentType: "credit_purchase";
      currency: string;
      amountCents: number;
      credits: number;
    }
  | {
      paymentType: "subscription";
      currency: string;
      amountCents: number;
      tier: string;
    };

type CreatePaystackCheckoutParams = {
  reference: string;
  amountCents: number;
  currency: string;
  callbackUrl: string;
  customer: {
    email: string;
    name?: string | null;
  };
  title: string;
  paymentType: PaystackPaymentType;
  metadata: Record<string, string | number | boolean | null>;
};

export type PaystackVerifiedTransaction = {
  id: number | string;
  reference: string;
  status: string;
  amount: number;
  currency: string;
  metadata: Record<string, unknown> | null;
};

function getPaystackSecretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("Paystack secret key is not configured.");
  }
  return key;
}

async function paystackRequest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${getPaystackSecretKey()}`,
      "Content-Type": "application/json",
      "User-Agent": "MatchIndeed/1.0 (+https://matchindeed.com)",
      ...(init.headers || {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: T;
  } | null;

  if (!response.ok || !payload?.status || !payload.data) {
    throw new Error(payload?.message || "Paystack request failed.");
  }

  return payload.data;
}

function paymentTypeCode(paymentType: PaystackPaymentType) {
  if (paymentType === "wallet_topup") return "wallet";
  if (paymentType === "credit_purchase") return "credits";
  return "sub";
}

function paymentTypeFromCode(code: string): PaystackPaymentType | null {
  if (code === "wallet") return "wallet_topup";
  if (code === "credits") return "credit_purchase";
  if (code === "sub") return "subscription";
  return null;
}

export function createPaystackTxRef(params: PaystackReference & { userId: string }) {
  const random = randomUUID().replace(/-/g, "").slice(0, 18);
  const base = [
    "mi",
    "paystack",
    "v1",
    paymentTypeCode(params.paymentType),
    params.currency.toLowerCase(),
    params.amountCents,
  ];

  if (params.paymentType === "subscription") {
    base.push(params.tier.toLowerCase());
  }

  if (params.paymentType === "credit_purchase") {
    base.push(params.credits);
  }

  base.push(params.userId.slice(0, 8), random);
  return base.join("-");
}

export function parsePaystackTxRef(txRef: string): PaystackReference | null {
  const parts = txRef.split("-");
  const [brand, provider, version, paymentCode, currency, amountCentsRaw] = parts;
  if (brand !== "mi" || provider !== "paystack" || version !== "v1") {
    return null;
  }

  const paymentType = paymentTypeFromCode(paymentCode);
  if (!paymentType) return null;

  const amountCents = Number(amountCentsRaw);
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return null;
  }

  if (paymentType === "wallet_topup") {
    if (parts.length !== 8) return null;
    return { paymentType, currency, amountCents };
  }

  if (paymentType === "credit_purchase") {
    if (parts.length !== 9) return null;
    const credits = Number(parts[6]);
    if (!Number.isInteger(credits) || credits <= 0) return null;
    return { paymentType, currency, amountCents, credits };
  }

  if (parts.length !== 9) return null;
  const tier = parts[6];
  if (!tier) return null;
  return { paymentType, currency, amountCents, tier };
}

export async function createPaystackCheckoutUrl(params: CreatePaystackCheckoutParams) {
  const metadata = {
    ...params.metadata,
    payment_provider: "paystack",
    payment_type: params.paymentType,
    title: params.title,
  };

  const data = await paystackRequest<{
    authorization_url: string;
    access_code: string;
    reference: string;
  }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: params.customer.email,
      amount: params.amountCents,
      currency: params.currency.toUpperCase(),
      reference: params.reference,
      callback_url: params.callbackUrl,
      metadata,
    }),
  });

  return {
    reference: data.reference,
    accessCode: data.access_code,
    url: data.authorization_url,
  };
}

export async function verifyPaystackTransaction(reference: string) {
  return paystackRequest<PaystackVerifiedTransaction>(
    `/transaction/verify/${encodeURIComponent(reference)}`
  );
}
