export function signInContent(brandName: string) {
  return {
    heading: `Sign in to ${brandName}`,
    subheading: "with GDH Appointments",
    countryLabel: "Country",
    phonePlaceholder: "Mobile Phone Number",
    cta: "Request Sign in Code",
    disclosure: `By continuing, you'll get a one-time SMS code from GDH Appointments on ${brandName}'s behalf. Message and data rates may apply.`,
  };
}

export function otpContent(phoneMasked: string) {
  return {
    title: (
      <>
        Enter the code we sent to <b>{phoneMasked}</b>
      </>
    ),
    cta: "Verify & sign in",
    changeNumber: "Change number",
    resendReady: "Resend code",
  };
}

export const errorMessages: Record<string, string> = {
  invalid_phone: "Enter a valid phone number for the selected country.",
  country_not_supported: "This country isn't supported for this account yet.",
  unknown_tenant: "We couldn't find that business.",
  rate_limited: "Too many attempts. Try again in a few minutes.",
  invalid: "That code isn't right.",
  expired: "This code expired. Request a new one.",
  too_many_attempts: "Too many incorrect attempts. Request a new code.",
  not_found: "This code has expired. Request a new one.",
  cooldown: "Please wait before requesting another code.",
  max_resends: "You've reached the resend limit. Request a new code from the previous screen.",
  not_verified: "Your code verification expired. Start over.",
  network: "Something went wrong. Check your connection and try again.",
};
