import {
  getCountries,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumberWithError,
  type CountryCode,
} from "libphonenumber-js";

export type CountryOption = {
  code: CountryCode;
  name: string;
  callingCode: string;
  flag: string;
};

function flagEmoji(countryCode: string): string {
  return countryCode
    .toUpperCase()
    .replace(/./g, (char) =>
      String.fromCodePoint(127397 + char.charCodeAt(0)),
    );
}

let regionNames: Intl.DisplayNames | undefined;
function countryName(countryCode: string): string {
  regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
  return regionNames.of(countryCode) ?? countryCode;
}

let allCountriesCache: CountryOption[] | undefined;

export function getAllCountries(): CountryOption[] {
  allCountriesCache ??= getCountries()
    .map((code) => ({
      code,
      name: countryName(code),
      callingCode: getCountryCallingCode(code),
      flag: flagEmoji(code),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return allCountriesCache;
}

export function getCountryOptions(allowList?: string[]): CountryOption[] {
  const all = getAllCountries();
  if (!allowList || allowList.length === 0) return all;
  const allowed = new Set(allowList.map((c) => c.toUpperCase()));
  return all.filter((c) => allowed.has(c.code));
}

export function normalizeToE164(
  rawNumber: string,
  country: string,
): string | null {
  try {
    if (!isValidPhoneNumber(rawNumber, country as CountryCode)) return null;
    return parsePhoneNumberWithError(rawNumber, country as CountryCode)
      .number;
  } catch {
    return null;
  }
}

export function maskE164(e164: string): string {
  try {
    const parsed = parsePhoneNumberWithError(e164);
    const national = parsed.nationalNumber;
    const last2 = national.slice(-2);
    return `+${parsed.countryCallingCode} •••• •• ${last2}`;
  } catch {
    return e164.slice(0, -2).replace(/\d/g, "•") + e164.slice(-2);
  }
}
