type PriceMap = {
  single: string; // one-time (mode: "payment")
  monthly: string; // subscription (mode: "subscription")
  yearly: string; // subscription (mode: "subscription")
};

function envOr(def: string, key: string): string {
  const v = (import.meta as any).env?.[key];
  return typeof v === "string" && v.trim().length > 0 ? v : def;
}

// LIVE defaults (from project notes). Override via env when needed.
export const PRICE_IDS: PriceMap = {
  single: envOr("price_1TwQ1OQQU5vuhlNj5peGUJbZ", "VITE_PRICE_SINGLE"),
  monthly: envOr("price_1TwPxXQQU5vuhlNj9ybv7iLZ", "VITE_PRICE_MONTHLY"),
  yearly: envOr("price_1TwPyFQQU5vuhlNjyCq1Nt1y", "VITE_PRICE_YEARLY"),
};
