import { NextRequest } from "next/server";

type CronAuthResult = {
  authorized: boolean;
  status: number;
  error?: string;
};

export function validateCronAuth(request: NextRequest): CronAuthResult {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return {
        authorized: false,
        status: 500,
        error: "CRON_SECRET is not configured",
      };
    }

    return { authorized: true, status: 200 };
  }

  if (authHeader !== `Bearer ${secret}`) {
    return { authorized: false, status: 401, error: "Unauthorized" };
  }

  return { authorized: true, status: 200 };
}
