export type DisplayUnits = "us" | "metric";

// For now we FORCE 'us' for all users; later we can read from Firestore settings.
export function useUnits(): DisplayUnits {
  return "us";
}

// Optional one-time migration: if user settings missing, we'd set to 'us'.
// (Left as TODO for when settings are finalized.)
