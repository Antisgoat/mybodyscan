import { useOnboardingStatus } from "./useOnboardingStatus";

export function useNeedsOnboardingMBS() {
  const { loading, personalizationCompleted } = useOnboardingStatus();
  return { loading, needs: !personalizationCompleted };
}
