const FALLBACK_COUNTRY: DefaultCountry = "US";

const SPECIFIC_LOCALE_MAP: Record<string, DefaultCountry> = {
  "en-us": "US",
  "en-gb": "GB",
  "en-au": "AU",
  "en-ca": "CA",
  "fr-fr": "FR",
  "fr-ca": "CA",
  "de-de": "DE",
  "es-mx": "MX",
  "es-us": "US",
  "pt-br": "BR",
};

const REGION_MAP: Record<string, DefaultCountry> = {
  us: "US",
  ca: "CA",
  gb: "GB",
  uk: "GB",
  au: "AU",
  fr: "FR",
  de: "DE",
  mx: "MX",
  br: "BR",
};

export type DefaultCountry =
  | "US"
  | "GB"
  | "FR"
  | "DE"
  | "MX"
  | "BR"
  | "CA"
  | "AU"
  | "EU";

export function defaultCountryFromLocale(
  locale?: string | null
): DefaultCountry {
  const raw = (
    locale ||
    (typeof navigator !== "undefined" ? navigator.language : undefined) ||
    FALLBACK_COUNTRY
  ).toLowerCase();
  if (SPECIFIC_LOCALE_MAP[raw]) {
    return SPECIFIC_LOCALE_MAP[raw];
  }
  const parts = raw.split(/[-_]/);
  const region = parts[1] || parts[0];
  if (region && REGION_MAP[region]) {
    return REGION_MAP[region];
  }
  return "EU";
}
