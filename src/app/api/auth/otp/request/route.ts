import { NextResponse } from "next/server";
import { getTenantBySlug } from "@/lib/tenants";
import { normalizeToE164, maskE164 } from "@/lib/phone";
import { checkOtpRequestRateLimit, createChallenge, OTP_LIMITS } from "@/lib/otp-store";
import { sendOtpSms } from "@/lib/sms";
import { requestIp } from "@/lib/validation";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const tenantSlug = typeof body?.tenantSlug === "string" ? body.tenantSlug : "";
  const country = typeof body?.country === "string" ? body.country : "";
  const phone = typeof body?.phone === "string" ? body.phone : "";

  const tenant = getTenantBySlug(tenantSlug);
  if (!tenant) {
    return NextResponse.json({ error: "unknown_tenant" }, { status: 404 });
  }
  if (!tenant.allowedCountries.includes(country)) {
    return NextResponse.json({ error: "country_not_supported" }, { status: 400 });
  }

  const phoneE164 = normalizeToE164(phone, country);
  if (!phoneE164) {
    return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  }

  const rateLimit = checkOtpRequestRateLimit(phoneE164, requestIp(request));
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "rate_limited", scope: rateLimit.reason },
      { status: 429 },
    );
  }

  const { challenge, code } = createChallenge(tenantSlug, phoneE164);
  try {
    await sendOtpSms(phoneE164, code, tenant.displayName);
  } catch (err) {
    console.error("[sms] failed to send OTP:", err);
    return NextResponse.json({ error: "sms_failed" }, { status: 502 });
  }

  return NextResponse.json({
    challengeId: challenge.id,
    phoneMasked: maskE164(phoneE164),
    expiresInSec: OTP_LIMITS.CODE_TTL_MS / 1000,
    resendAfterSec: OTP_LIMITS.RESEND_COOLDOWN_MS / 1000,
    // Dev-only convenience so the flow is clickable without an SMS provider wired up.
    ...(process.env.NODE_ENV !== "production" ? { devCode: code } : {}),
  });
}
