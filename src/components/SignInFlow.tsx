"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { isValidPhoneNumber } from "libphonenumber-js";
import type { CountryOption } from "@/lib/phone";
import type { TenantConfig } from "@/lib/tenants";
import { CountrySelect } from "@/components/CountrySelect";
import { otpContent, signInContent, errorMessages } from "@/lib/content";

type Step = "phone" | "otp" | "profile";

export function SignInFlow({
  tenant,
  countries,
  defaultCountry,
}: {
  tenant: TenantConfig;
  countries: CountryOption[];
  defaultCountry: CountryOption;
}) {
  const [step, setStep] = useState<Step>("phone");
  const [country, setCountry] = useState(defaultCountry);
  const [phoneRaw, setPhoneRaw] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [phoneMasked, setPhoneMasked] = useState<string>("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(6).fill(""));
  const [otpError, setOtpError] = useState<string | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);

  const [profileName, setProfileName] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);

  const content = signInContent(tenant.displayName);
  const otpBoxRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const id = setInterval(() => setResendSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendSeconds]);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setPhoneError(null);

    if (!isValidPhoneNumber(phoneRaw, country.code)) {
      setPhoneError(errorMessages.invalid_phone);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantSlug: tenant.slug, country: country.code, phone: phoneRaw }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhoneError(errorMessages[data.error] ?? errorMessages.network);
        return;
      }
      setChallengeId(data.challengeId);
      setPhoneMasked(data.phoneMasked);
      setDevCode(data.devCode ?? null);
      setResendSeconds(data.resendAfterSec);
      setOtpDigits(Array(6).fill(""));
      setOtpError(null);
      setStep("otp");
    } catch {
      setPhoneError(errorMessages.network);
    } finally {
      setLoading(false);
    }
  }

  async function submitCode(code: string) {
    if (!challengeId || code.length !== 6) return;
    setLoading(true);
    setOtpError(null);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOtpError(errorMessages[data.error] ?? errorMessages.network);
        setOtpDigits(Array(6).fill(""));
        otpBoxRefs.current[0]?.focus();
        return;
      }
      if (data.status === "needs_profile") {
        setPhoneMasked(data.phoneMasked);
        setStep("profile");
        return;
      }
      window.location.assign(data.redirectUrl);
    } catch {
      setOtpError(errorMessages.network);
    } finally {
      setLoading(false);
    }
  }

  function onDigitChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1);
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    if (digit && index < 5) otpBoxRefs.current[index + 1]?.focus();
    if (next.every((d) => d !== "")) submitCode(next.join(""));
  }

  function onDigitKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpBoxRefs.current[index - 1]?.focus();
    }
  }

  function onDigitPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(6).fill("");
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setOtpDigits(next);
    otpBoxRefs.current[Math.min(pasted.length, 5)]?.focus();
    if (pasted.length === 6) submitCode(pasted);
  }

  async function resend() {
    if (!challengeId || resendSeconds > 0) return;
    setLoading(true);
    setOtpError(null);
    try {
      const res = await fetch("/api/auth/otp/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOtpError(errorMessages[data.error] ?? errorMessages.network);
        return;
      }
      setDevCode(data.devCode ?? null);
      setResendSeconds(data.resendAfterSec);
      setOtpDigits(Array(6).fill(""));
      otpBoxRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function completeProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeId) return;
    setLoading(true);
    setProfileError(null);
    try {
      const res = await fetch("/api/auth/profile/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, name: profileName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProfileError(errorMessages[data.error] ?? errorMessages.network);
        return;
      }
      window.location.assign(data.redirectUrl);
    } finally {
      setLoading(false);
    }
  }

  const accentStyle = { ["--accent" as string]: tenant.accent };

  return (
    <div className="mx-auto w-full max-w-sm sm:max-w-xl" style={accentStyle}>
      <div className="mb-5 flex items-center justify-center gap-2 text-[13px] font-medium text-neutral-500 sm:mb-8 sm:gap-3 sm:text-[20px]">
        {tenant.logoUrl ? (
          <Image
            src={tenant.logoUrl}
            alt={`${tenant.displayName} logo`}
            width={27}
            height={27}
            unoptimized
            className="h-[18px] w-[18px] rounded-[5px] object-contain sm:h-[27px] sm:w-[27px] sm:rounded-[8px]"
          />
        ) : (
          <span
            className="h-[18px] w-[18px] rounded-[6px] sm:h-[27px] sm:w-[27px] sm:rounded-[9px]"
            style={{ background: tenant.accent }}
            aria-hidden
          />
        )}
        {tenant.displayName}
      </div>

      <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_28px_-16px_rgba(0,0,0,0.12)] sm:rounded-[36px] sm:p-12">
        {step === "phone" && (
          <form onSubmit={requestCode}>
            <h1 className="mb-1 text-center text-[22px] leading-snug font-semibold text-neutral-900 sm:mb-1.5 sm:text-[33px]">
              {content.heading}
            </h1>
            <p className="mb-6 text-center text-[13px] font-medium text-neutral-400 sm:mb-9 sm:text-[20px]">
              {content.subheading}
            </p>

            <div className="flex gap-2.5 sm:gap-4">
              <CountrySelect
                options={countries}
                value={country}
                onChange={setCountry}
                accent={tenant.accent}
              />
              <div className="min-w-0 flex-1">
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  maxLength={10}
                  placeholder={content.phonePlaceholder}
                  value={phoneRaw}
                  onChange={(e) => setPhoneRaw(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className="h-full w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 text-[15px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-offset-1 sm:rounded-3xl sm:px-6 sm:py-5 sm:text-[23px]"
                  style={{ ["--tw-ring-color" as string]: tenant.accent }}
                />
              </div>
            </div>

            {phoneError && (
              <p className="mt-2 text-[13px] text-red-600 sm:mt-3 sm:text-[20px]" role="alert">
                {phoneError}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || phoneRaw.trim() === ""}
              className="mt-4 w-full rounded-full py-3.5 text-[15px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40 sm:mt-8 sm:py-5 sm:text-[23px]"
              style={{ background: tenant.accent }}
            >
              {loading ? "Sending…" : content.cta}
            </button>

            <p className="mt-4 text-center text-[12px] leading-relaxed text-neutral-400 sm:mt-6 sm:text-[18px]">
              {content.disclosure}
            </p>
          </form>
        )}

        {step === "otp" && (
          <div>
            <button
              type="button"
              onClick={() => setStep("phone")}
              className="mb-4 text-[13px] text-neutral-500 hover:text-neutral-700 sm:mb-6 sm:text-[20px]"
            >
              ← {otpContent(phoneMasked).changeNumber}
            </button>

            <h1 className="mb-5 text-[22px] leading-snug font-semibold text-neutral-900 sm:mb-8 sm:text-[33px]">
              {otpContent(phoneMasked).title}
            </h1>

            {devCode && (
              <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800 sm:mb-6 sm:px-4 sm:py-3 sm:text-[19px]">
                Dev mode — no SMS provider connected. Your code is <b>{devCode}</b>.
              </p>
            )}

            <div className="flex gap-2 sm:gap-3">
              {otpDigits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    otpBoxRefs.current[i] = el;
                  }}
                  value={digit}
                  onChange={(e) => onDigitChange(i, e.target.value)}
                  onKeyDown={(e) => onDigitKeyDown(i, e)}
                  onPaste={onDigitPaste}
                  inputMode="numeric"
                  maxLength={1}
                  aria-label={`Digit ${i + 1}`}
                  className="aspect-square w-full rounded-2xl border text-center text-[18px] font-medium text-neutral-900 focus:outline-none focus:ring-2 focus:ring-offset-1 sm:rounded-3xl sm:text-[27px]"
                  style={{
                    borderColor: digit ? tenant.accent : "#e5e5e5",
                    ["--tw-ring-color" as string]: tenant.accent,
                  }}
                />
              ))}
            </div>

            {otpError && (
              <p className="mt-3 text-[13px] text-red-600 sm:mt-4 sm:text-[20px]" role="alert">
                {otpError}
              </p>
            )}

            <button
              type="button"
              onClick={() => submitCode(otpDigits.join(""))}
              disabled={loading || otpDigits.some((d) => d === "")}
              className="mt-5 w-full rounded-full py-3.5 text-[15px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40 sm:mt-8 sm:py-5 sm:text-[23px]"
              style={{ background: tenant.accent }}
            >
              {loading ? "Verifying…" : otpContent(phoneMasked).cta}
            </button>

            <p className="mt-4 text-center text-[13px] text-neutral-500 sm:mt-6 sm:text-[20px]">
              {resendSeconds > 0 ? (
                <>Resend code in 0:{String(resendSeconds).padStart(2, "0")}</>
              ) : (
                <button type="button" onClick={resend} className="font-medium text-neutral-700 underline">
                  {otpContent(phoneMasked).resendReady}
                </button>
              )}
            </p>
          </div>
        )}

        {step === "profile" && (
          <form onSubmit={completeProfile}>
            <h1 className="mb-2 text-[22px] leading-snug font-semibold text-neutral-900 sm:mb-3 sm:text-[33px]">
              You&rsquo;re verified — what should we call you?
            </h1>
            <p className="mb-5 text-[13.5px] text-neutral-500 sm:mb-8 sm:text-[20px]">
              First visit to {tenant.displayName} on GDH Appointments. No password needed.
            </p>

            <input
              type="text"
              autoFocus
              placeholder="Full name"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 text-[15px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-offset-1 sm:rounded-3xl sm:px-6 sm:py-5 sm:text-[23px]"
              style={{ ["--tw-ring-color" as string]: tenant.accent }}
            />

            {profileError && (
              <p className="mt-2 text-[13px] text-red-600 sm:mt-3 sm:text-[20px]" role="alert">
                {profileError}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || profileName.trim() === ""}
              className="mt-4 w-full rounded-full py-3.5 text-[15px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40 sm:mt-6 sm:py-5 sm:text-[23px]"
              style={{ background: tenant.accent }}
            >
              {loading ? "Finishing…" : "Finish sign in"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
