/**
 * Single source of truth for pricing labels shown in marketing + Plans.
 * If your app already has a pricing source, import those values here and export
 * a normalized shape. Otherwise, fill placeholders below.
 */
export type PriceSnapshot = {
  id: string;
  label: string;
  priceText: string;   // e.g. "$9.99"
  blurb?: string;
};

export type PricingCatalog = {
  oneScan: PriceSnapshot;
  threePack: PriceSnapshot;
  fivePack: PriceSnapshot;
  monthly: PriceSnapshot;     // 3 scans/month
  yearly: PriceSnapshot;      // 3 scans/month (annual)
};

// TRY to import from existing in-app pricing if available:
let catalog: PricingCatalog | null = null;
try {
  // Example: if you already have exports like MONTHLY_PRICE_TEXT etc., import and map them here.
  // If not found, the catch will fall back to placeholders below.
  // @ts-ignore - optional import
  const plans = await import("../pages/Plans"); // adjust if you have a central pricing module
  // If you have readable price text there, map it. Otherwise the catch triggers.
  // This block is intentionally defensive and no-op by default.
  if (plans && plans.DEFAULT_PRICING_CATALOG) {
    catalog = plans.DEFAULT_PRICING_CATALOG as PricingCatalog;
  }
} catch (_) {
  /* fall through to placeholder catalog below */
}

// Fallback (edit these if needed). This is only used if no central pricing is found.
// Prefer keeping these in sync with Plans UI until you wire a shared source.
if (!catalog) {
  catalog = {
    oneScan:   { id: "one-scan",   label: "1 Scan",  priceText: "$9.99" },
    threePack: { id: "three-pack", label: "3 Scans", priceText: "$19.99" },
    fivePack:  { id: "five-pack",  label: "5 Scans", priceText: "$29.99" },
    monthly:   { id: "monthly",    label: "Monthly", priceText: "$14.99", blurb: "First month, then $24.99/mo" },
    yearly:    { id: "yearly",     label: "Yearly",  priceText: "$199.99", blurb: "3 scans/month" },
  };
}

export const PRICING_CATALOG: PricingCatalog = catalog;
