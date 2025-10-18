import { useState } from "react";
import { authedFetch } from "@/lib/api";

export function useComputePlan() {
  const [computing, setComputing] = useState(false);

  const computePlan = async (profile: Record<string, unknown>) => {
    setComputing(true);
    try {
      const response = await authedFetch("/computePlan", {
        method: "POST",
        body: JSON.stringify(profile),
      });

      if (!response.ok) {
        throw new Error("Failed to compute plan");
      }

      const result = await response.json();
      return result;
    } catch (error) {
      throw error;
    } finally {
      setComputing(false);
    }
  };

  return { computePlan, computing };
}