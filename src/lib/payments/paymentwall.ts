import { createHash, randomUUID } from "crypto";

export type PaymentwallPaymentType =
  | "wallet_topup"
  | "credit_purchase"
  | "subscription";

type CreatePaymentwallCheckoutUrlParams = {
  txRef: string;
  userId: string;
  amount: number;
  amountCents: number;
  currency: string;
  customer: {
    email: string;
    name?: string | null;
  };
  title: string;
  successUrl: string;
  paymentType: PaymentwallPaymentType;
};

export type PaymentwallCheckoutSession = {
  txRef: string;
  url: string;
};

export type PaymentwallPingbackParams = Record<string, string>;
export type PaymentwallReference =
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

const PAYMENTWALL_WIDGET_BASE_URL = "https://api.paymentwall.com/api";
const PAYMENTWALL_GOODS_CONTROLLER = "subscription";
const DEFAULT_WIDGET_CODE = "pw_1";
const DEFAULT_SIGNATURE_VERSION = 3;

function getProjectKey() {
  const key = process.env.PAYMENTWALL_PROJECT_KEY?.trim();
  if (!key) {
    throw new Error("Paymentwall project key is not configured.");
  }
  return key;
}

function getSecretKey() {
  const key = process.env.PAYMENTWALL_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("Paymentwall secret key is not configured.");
  }
  return key;
}

function getWidgetCode() {
  return process.env.PAYMENTWALL_WIDGET_CODE?.trim() || DEFAULT_WIDGET_CODE;
}

function stringifySignatureValue(value: unknown): string {
  if (value === false) return "0";
  if (value === null || value === undefined) return "";
  return String(value);
}

function signatureBaseString(params: Record<string, unknown>) {
  return Object.keys(params)
    .filter((key) => key !== "sign" && key !== "sig")
    .sort()
    .map((key) => {
      const value = params[key];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return Object.keys(value as Record<string, unknown>)
          .sort()
          .map(
            (childKey) =>
              `${key}[${childKey}]=${stringifySignatureValue(
                (value as Record<string, unknown>)[childKey]
              )}`
          )
          .join("");
      }
      return `${key}=${stringifySignatureValue(value)}`;
    })
    .join("");
}

export function calculatePaymentwallSignature(
  params: Record<string, unknown>,
  secretKey = getSecretKey(),
  version = DEFAULT_SIGNATURE_VERSION
) {
  if (Number(version) === 1) {
    return createHash("md5")
      .update(
        `uid=${stringifySignatureValue(params.uid)}` +
          `goodsid=${stringifySignatureValue(params.goodsid)}` +
          `slength=${stringifySignatureValue(params.slength)}` +
          `speriod=${stringifySignatureValue(params.speriod)}` +
          `type=${stringifySignatureValue(params.type)}` +
          `ref=${stringifySignatureValue(params.ref)}` +
          secretKey,
        "utf8"
      )
      .digest("hex");
  }

  const algorithm = Number(version) === 3 ? "sha256" : "md5";
  return createHash(algorithm)
    .update(`${signatureBaseString(params)}${secretKey}`, "utf8")
    .digest("hex");
}

export function verifyPaymentwallPingback(params: PaymentwallPingbackParams) {
  const passedSignature = params.sig;
  if (!passedSignature) return false;

  const version = Number(params.sign_version || 1);
  let paramsToSign: Record<string, unknown>;

  if (version === 1) {
    paramsToSign = {
      uid: params.uid || "",
      goodsid: params.goodsid || "",
      slength: params.slength || "",
      speriod: params.speriod || "",
      type: params.type || "",
      ref: params.ref || "",
    };
  } else {
    paramsToSign = { ...params };
  }

  const expectedSignature = calculatePaymentwallSignature(
    paramsToSign,
    getSecretKey(),
    version
  );

  return expectedSignature === passedSignature;
}

export function createPaymentwallCheckoutUrl(
  params: CreatePaymentwallCheckoutUrlParams
): PaymentwallCheckoutSession {
  const signatureVersion = DEFAULT_SIGNATURE_VERSION;
  const checkoutParams: Record<string, string | number> = {
    key: getProjectKey(),
    uid: params.userId,
    widget: getWidgetCode(),
    amount: params.amount.toFixed(2),
    currencyCode: params.currency.toUpperCase(),
    ag_name: params.title,
    ag_external_id: params.txRef,
    ag_type: "fixed",
    email: params.customer.email,
    "history[registration_date]": Math.floor(Date.now() / 1000),
    ps: "all",
    success_url: params.successUrl,
    sign_version: signatureVersion,
    mi_type: params.paymentType,
    mi_amount_cents: params.amountCents,
  };

  if (params.customer.name) {
    checkoutParams.name = params.customer.name;
  }

  checkoutParams.sign = calculatePaymentwallSignature(
    checkoutParams,
    getSecretKey(),
    signatureVersion
  );

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(checkoutParams)) {
    query.set(key, String(value));
  }

  return {
    txRef: params.txRef,
    url: `${PAYMENTWALL_WIDGET_BASE_URL}/${PAYMENTWALL_GOODS_CONTROLLER}?${query.toString()}`,
  };
}

export function createPaymentwallTxRef(params: PaymentwallReference & { userId: string }) {
  const random = randomUUID().replace(/-/g, "").slice(0, 18);
  const base = [
    "mi",
    "pw",
    "v1",
    params.paymentType,
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

export function parsePaymentwallTxRef(txRef: string): PaymentwallReference | null {
  const parts = txRef.split("-");
  const [brand, provider, version, paymentType, currency, amountCentsRaw] = parts;
  if (brand !== "mi" || provider !== "pw" || version !== "v1") {
    return null;
  }

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

  if (paymentType === "subscription") {
    if (parts.length !== 9) return null;
    const tier = parts[6];
    if (!tier) return null;
    return { paymentType, currency, amountCents, tier };
  }

  return null;
}
