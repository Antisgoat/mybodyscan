export type ScanCreditAccessSignals = {
  staff: boolean;
  unlimitedClaim: boolean;
  unlimitedMirror: boolean;
  proEntitled?: boolean;
};

/**
 * Paid subscriptions unlock Pro features and grant metered scan credits.
 * They do not make scans unlimited. Only staff and explicitly unlimited
 * accounts bypass the credit bucket + ledger path.
 */
export function shouldBypassScanCredits(
  signals: ScanCreditAccessSignals
): boolean {
  return (
    signals.staff === true ||
    signals.unlimitedClaim === true ||
    signals.unlimitedMirror === true
  );
}
