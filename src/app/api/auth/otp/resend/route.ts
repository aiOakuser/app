import { NextResponse } from "next/server";
import { getChallenge, resendChallenge, OTP_LIMITS } from "@/lib/otp-store";
import { getTenantBySlug } from "@/lib/tenants";
import { sendOtpSms } from "@/lib/sms";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const challengeId = typeof body?.challengeId === "string" ? body.challengeId : "";

  const existing = getChallenge(challengeId);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const result = resendChallenge(challengeId);
  if (!result.ok) {
    const status = { cooldown: 429, max_resends: 429, not_found: 404 }[result.reason];
    return NextResponse.json({ error: result.reason }, { status });
  }

  const tenant = getTenantBySlug(existing.tenantSlug);
  await sendOtpSms(existing.phoneE164, result.code, tenant?.displayName ?? "GDH Appointments");

  return NextResponse.json({
    expiresInSec: OTP_LIMITS.CODE_TTL_MS / 1000,
    resendAfterSec: OTP_LIMITS.RESEND_COOLDOWN_MS / 1000,
    ...(process.env.NODE_ENV !== "production" ? { devCode: result.code } : {}),
  });
}
