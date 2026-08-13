import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "gdh_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days — a production build would
// split this into a short-lived access token plus a rotating refresh token.

// Falls back to a fixed, publicly-known dev secret so the demo runs without setup.
// Route Handlers and Server Component pages compile as separate module graphs in
// Next.js dev, so a *generated* per-process secret (e.g. random bytes at import
// time) ends up different in each — tokens signed in one layer fail to verify in
// the other. A constant sidesteps that; set AUTH_SECRET for anything beyond local dev.
const secretString = process.env.AUTH_SECRET ?? "dev-only-insecure-secret-do-not-deploy";
if (!process.env.AUTH_SECRET) {
  console.warn(
    "[auth] AUTH_SECRET is not set — using a fixed, insecure dev secret. Set AUTH_SECRET before deploying.",
  );
}
const secretKey = new TextEncoder().encode(secretString);

export type SessionPayload = {
  tenantUserId: string;
  tenantSlug: string;
  phoneMasked: string;
};

export async function createSessionToken(
  payload: SessionPayload,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey);
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    const { tenantUserId, tenantSlug, phoneMasked } = payload as Record<
      string,
      unknown
    >;
    if (
      typeof tenantUserId !== "string" ||
      typeof tenantSlug !== "string" ||
      typeof phoneMasked !== "string"
    ) {
      return null;
    }
    return { tenantUserId, tenantSlug, phoneMasked };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_MAX_AGE = SESSION_TTL_SECONDS;
