import { getPriceAllowlist } from "../lib/config.js";

export type StripePlanInfo = {
  plan: "one" | "pack3" | "pack5" | "monthly" | "yearly" | "extra";
  credits: number;
  mode: "payment" | "subscription";
};

const PLAN_RULES: Array<{
  keys: string[];
  info: StripePlanInfo;
}> = [
  {
    keys: ["single", "one", "starter"],
    info: { plan: "one", credits: 1, mode: "payment" },
  },
  {
    keys: ["pack3"],
    info: { plan: "pack3", credits: 3, mode: "payment" },
  },
  {
    keys: ["pack5"],
    info: { plan: "pack5", credits: 5, mode: "payment" },
  },
  {
    keys: ["monthly", "pro_monthly"],
    info: { plan: "monthly", credits: 3, mode: "subscription" },
  },
  {
    keys: ["annual", "yearly", "elite_annual"],
    info: { plan: "yearly", credits: 36, mode: "subscription" },
  },
  {
    keys: ["extra"],
    info: { plan: "extra", credits: 1, mode: "payment" },
  },
];

export function resolveStripePlan(priceId: string): StripePlanInfo | null {
  const normalized = String(priceId || "").trim();
  if (!normalized) return null;

  const { planToPrice } = getPriceAllowlist();
  for (const rule of PLAN_RULES) {
    if (
      rule.keys.some((key) => {
        const configured = planToPrice[key];
        return Boolean(configured && configured === normalized);
      })
    ) {
      return { ...rule.info };
    }
  }
  return null;
}
