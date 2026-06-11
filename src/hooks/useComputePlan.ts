import { useState } from "react";
import { getCurrentUser } from "@/auth/mbs-auth";
import { completeCoachOnboarding } from "@/lib/onboarding/completeCoachOnboarding";

export function useComputePlan() {
  const [computing, setComputing] = useState(false);

  const computePlan = async (profile: any) => {
    setComputing(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error("auth_required");
      return await completeCoachOnboarding({ user, input: profile });
    } catch (error) {
      console.error("Error computing plan:", error);
      throw error;
    } finally {
      setComputing(false);
    }
  };

  return { computePlan, computing };
}
