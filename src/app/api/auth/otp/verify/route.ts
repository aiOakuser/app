import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getChallenge, verifyChallenge } from "@/lib/otp-store";
import { findOrCreateIdentity, getTenantUser } from "@/lib/identities";
import { maskE164 } from "@/lib/phone";
import { createSessionToken, SESSION_COOKIE, SESSION_COOKIE_MAX_AGE } from "@/lib/session";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const challengeId = typeof body?.challengeId === "string" ? body.challengeId : "";
  const code = typeof body?.code === "string" ? body.code : "";

  const result = verifyChallenge(challengeId, code);
  if (result !== "ok") {
    const status = { invalid: 400, expired: 410, too_many_attempts: 429, not_found: 404 }[result];
    return NextResponse.json({ error: result }, { status });
  }

  const challenge = getChallenge(challengeId);
  if (!challenge) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const identity = findOrCreateIdentity(challenge.phoneE164);
  const tenantUser = getTenantUser(challenge.tenantSlug, identity.id);

  if (!tenantUser) {
    return NextResponse.json({
      status: "needs_profile",
      challengeId,
      phoneMasked: maskE164(challenge.phoneE164),
    });
  }

  const token = await createSessionToken({
    tenantUserId: tenantUser.id,
    tenantSlug: challenge.tenantSlug,
    phoneMasked: maskE164(challenge.phoneE164),
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });

  return NextResponse.json({
    status: "signed_in",
    redirectUrl: `/t/${challenge.tenantSlug}/welcome`,
  });
}
