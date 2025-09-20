const FALLBACK_COUNTRY = "US";

const SPECIFIC_LOCALE_MAP: Record<string, string> = {
  "en-us": "US",
  "en-gb": "GB",
  "en-ca": "CA",
  "en-au": "AU",
  "fr-fr": "FR",
  "fr-ca": "CA",
  "es-us": "US",
  "es-mx": "MX",
  "es-es": "ES",
  "de-de": "DE",
  "it-it": "IT",
  "pt-br": "BR",
};

export function defaultCountryFromLocale(locale?: string | null): string {
  const raw = (locale || (typeof navigator !== "undefined" ? navigator.language : undefined) || FALLBACK_COUNTRY).toLowerCase();
  if (SPECIFIC_LOCALE_MAP[raw]) {
    return SPECIFIC_LOCALE_MAP[raw];
  }
  const parts = raw.split(/[-_]/);
  if (parts.length > 1) {
    return parts[1].toUpperCase();
  }
  if (parts[0].length === 2) {
    return parts[0].toUpperCase();
  }
  return FALLBACK_COUNTRY;
}
