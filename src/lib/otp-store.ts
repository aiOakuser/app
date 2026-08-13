import { randomBytes, randomInt, createHash, randomUUID } from "crypto";

// In-memory only — a real deployment swaps this for Postgres/Redis so
// challenges and rate limits survive a restart and are shared across instances.

type Challenge = {
  id: string;
  tenantSlug: string;
  phoneE164: string;
  codeHash: string;
  salt: string;
  createdAt: number;
  expiresAt: number;
  attemptCount: number;
  resendCount: number;
  lastSentAt: number;
  consumedAt: number | null;
};

const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_RESENDS = 3;

const REQUEST_LIMIT_PER_PHONE = { max: 3, windowMs: 10 * 60 * 1000 };
const REQUEST_LIMIT_PER_IP = { max: 5, windowMs: 10 * 60 * 1000 };

const challenges = new Map<string, Challenge>();
const rateWindows = new Map<string, number[]>();

function hashCode(code: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${code}`).digest("hex");
}

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function checkAndRecordRateLimit(
  key: string,
  limit: { max: number; windowMs: number },
): boolean {
  const now = Date.now();
  const windowStart = now - limit.windowMs;
  const hits = (rateWindows.get(key) ?? []).filter((t) => t > windowStart);
  if (hits.length >= limit.max) {
    rateWindows.set(key, hits);
    return false;
  }
  hits.push(now);
  rateWindows.set(key, hits);
  return true;
}

export function checkOtpRequestRateLimit(phoneE164: string, ip: string) {
  const phoneOk = checkAndRecordRateLimit(
    `phone:${phoneE164}`,
    REQUEST_LIMIT_PER_PHONE,
  );
  if (!phoneOk) return { allowed: false as const, reason: "phone" as const };
  const ipOk = checkAndRecordRateLimit(`ip:${ip}`, REQUEST_LIMIT_PER_IP);
  if (!ipOk) return { allowed: false as const, reason: "ip" as const };
  return { allowed: true as const };
}

export function createChallenge(tenantSlug: string, phoneE164: string) {
  const code = generateCode();
  const salt = randomBytes(8).toString("hex");
  const now = Date.now();
  const challenge: Challenge = {
    id: randomUUID(),
    tenantSlug,
    phoneE164,
    codeHash: hashCode(code, salt),
    salt,
    createdAt: now,
    expiresAt: now + CODE_TTL_MS,
    attemptCount: 0,
    resendCount: 0,
    lastSentAt: now,
    consumedAt: null,
  };
  challenges.set(challenge.id, challenge);
  return { challenge, code };
}

export function getChallenge(challengeId: string): Challenge | undefined {
  return challenges.get(challengeId);
}

export type VerifyResult =
  | "ok"
  | "invalid"
  | "expired"
  | "too_many_attempts"
  | "not_found";

export function verifyChallenge(
  challengeId: string,
  code: string,
): VerifyResult {
  const challenge = challenges.get(challengeId);
  if (!challenge || challenge.consumedAt) return "not_found";
  if (Date.now() > challenge.expiresAt) return "expired";
  if (challenge.attemptCount >= MAX_ATTEMPTS) return "too_many_attempts";

  challenge.attemptCount += 1;
  if (hashCode(code, challenge.salt) !== challenge.codeHash) {
    return challenge.attemptCount >= MAX_ATTEMPTS
      ? "too_many_attempts"
      : "invalid";
  }

  challenge.consumedAt = Date.now();
  return "ok";
}

export type ResendResult =
  | { ok: true; code: string }
  | { ok: false; reason: "cooldown" | "max_resends" | "not_found" };

export function resendChallenge(challengeId: string): ResendResult {
  const challenge = challenges.get(challengeId);
  if (!challenge || challenge.consumedAt) return { ok: false, reason: "not_found" };
  if (Date.now() - challenge.lastSentAt < RESEND_COOLDOWN_MS) {
    return { ok: false, reason: "cooldown" };
  }
  if (challenge.resendCount >= MAX_RESENDS) {
    return { ok: false, reason: "max_resends" };
  }

  const code = generateCode();
  challenge.salt = randomBytes(8).toString("hex");
  challenge.codeHash = hashCode(code, challenge.salt);
  challenge.resendCount += 1;
  challenge.lastSentAt = Date.now();
  challenge.expiresAt = Date.now() + CODE_TTL_MS;
  challenge.attemptCount = 0;
  return { ok: true, code };
}

export const OTP_LIMITS = {
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  MAX_RESENDS,
};
