import { Capacitor } from "@capacitor/core";
import { DailySummary, HealthAdapter } from "./HealthAdapter.ts";

const HealthKit: any = (window as any)?.Capacitor?.Plugins?.HealthKit;

export class IOSHealthKitAdapter implements HealthAdapter {
  platform = "ios" as const;

  async canImport(): Promise<boolean> {
    return Capacitor.getPlatform() === "ios";
  }

  async requestPermissions(): Promise<boolean> {
    if (Capacitor.getPlatform() !== "ios" || !HealthKit) return false;
    try {
      await HealthKit.requestAuthorization({
        read: [
          "HKQuantityTypeIdentifierActiveEnergyBurned",
          "HKQuantityTypeIdentifierStepCount",
          "HKQuantityTypeIdentifierRestingHeartRate",
        ],
        write: [],
      });
      return true;
    } catch {
      return false;
    }
  }

  async getDailySummary(date: string): Promise<DailySummary> {
    if (!HealthKit) return { source: "healthkit" };
    try {
      const res = await HealthKit.queryStatistics({ date });
      return {
        source: "healthkit",
        activeEnergyKcal: res.activeEnergyBurned ?? undefined,
        steps: res.stepCount ?? undefined,
        restingHeartRate: res.restingHeartRate ?? undefined,
      };
    } catch {
      return { source: "healthkit" };
    }
  }
}

