export const IAP_PRODUCT_IDS = {
  monthly: "com.mybodyscan.pro.monthly",
  yearly: "com.mybodyscan.pro.yearly",
  one: "com.mybodyscan.scan.single",
} as const;

export type IapProductKind = keyof typeof IAP_PRODUCT_IDS;

export function getIapProductKind(productId: string): IapProductKind | null {
  const normalized = String(productId || "").trim();
  const match = Object.entries(IAP_PRODUCT_IDS).find(
    ([, configuredId]) => configuredId === normalized
  );
  return (match?.[0] as IapProductKind | undefined) ?? null;
}

export function isIapSubscription(kind: IapProductKind): boolean {
  return kind === "monthly" || kind === "yearly";
}
