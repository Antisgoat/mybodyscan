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
  single: envOr("price_1RuOpKQQU5vuhlNjipfFBsR0", "VITE_PRICE_SINGLE"),
  monthly: envOr("price_1S4XsVQQU5vuhlNjzdQzeySA", "VITE_PRICE_MONTHLY"),
  yearly: envOr("price_1S4Y6YQQU5vuhlNjeJFmshxX", "VITE_PRICE_YEARLY"),
};
