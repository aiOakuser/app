import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getChallenge } from "@/lib/otp-store";
import { findOrCreateIdentity, createTenantUser } from "@/lib/identities";
import { maskE164 } from "@/lib/phone";
import { createSessionToken, SESSION_COOKIE, SESSION_COOKIE_MAX_AGE } from "@/lib/session";

const PROOF_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const challengeId = typeof body?.challengeId === "string" ? body.challengeId : "";
  const firstName = typeof body?.firstName === "string" ? body.firstName.trim().slice(0, 80) : "";
  const lastName = typeof body?.lastName === "string" ? body.lastName.trim().slice(0, 80) : "";
  const email = typeof body?.email === "string" ? body.email.trim().slice(0, 254) : "";

  if (!firstName || !lastName) {
    return NextResponse.json({ error: "invalid_profile" }, { status: 400 });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const challenge = getChallenge(challengeId);
  if (!challenge || !challenge.consumedAt) {
    return NextResponse.json({ error: "not_verified" }, { status: 400 });
  }
  if (Date.now() - challenge.consumedAt > PROOF_WINDOW_MS) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  const identity = findOrCreateIdentity(challenge.phoneE164);
  const tenantUser = createTenantUser(challenge.tenantSlug, identity.id, {
    firstName,
    lastName,
    email: email || null,
  });

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
