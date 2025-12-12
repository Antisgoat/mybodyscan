/**
 * Single source of truth for pricing labels shown in marketing + Plans.
 * If your app already has a pricing source, import those values here and export
 * a normalized shape. Otherwise, fill placeholders below.
 */
export type PriceSnapshot = {
  id: string;
  label: string;
  priceText: string; // e.g. "$9.99"
  blurb?: string;
};

export type PricingCatalog = {
  oneScan: PriceSnapshot;
  threePack: PriceSnapshot;
  fivePack: PriceSnapshot;
  monthly: PriceSnapshot; // 3 scans/month
  yearly: PriceSnapshot; // 3 scans/month (annual)
};

// Direct catalog definition - no dynamic imports needed
const catalog: PricingCatalog = {
  oneScan: { id: "one-scan", label: "1 Scan", priceText: "$9.99" },
  threePack: { id: "three-pack", label: "3 Scans", priceText: "$19.99" },
  fivePack: { id: "five-pack", label: "5 Scans", priceText: "$29.99" },
  monthly: {
    id: "monthly",
    label: "Monthly",
    priceText: "$14.99",
    blurb: "First month, then $24.99/mo · 3 scans/month",
  },
  yearly: {
    id: "yearly",
    label: "Yearly",
    priceText: "$199.99",
    blurb: "3 scans/month",
  },
};

const baseCatalog = catalog;

export const PRICING_CATALOG = {
  oneScan: baseCatalog.oneScan,
  monthly: baseCatalog.monthly,
  yearly: baseCatalog.yearly,
} as const;

const UNUSED_SCAN_PACKS = {
  threePack: baseCatalog.threePack,
  fivePack: baseCatalog.fivePack,
};

void UNUSED_SCAN_PACKS;
