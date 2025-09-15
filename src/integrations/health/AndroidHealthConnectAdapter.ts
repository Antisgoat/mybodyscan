import { Capacitor } from "@capacitor/core";
import { DailySummary, HealthAdapter } from "./HealthAdapter";

const HealthConnect: any = (window as any)?.Capacitor?.Plugins?.HealthConnect;

export class AndroidHealthConnectAdapter implements HealthAdapter {
  platform: "android" = "android";

  async canImport(): Promise<boolean> {
    return Capacitor.getPlatform() === "android";
  }

  async requestPermissions(): Promise<boolean> {
    if (Capacitor.getPlatform() !== "android" || !HealthConnect) return false;
    try {
      await HealthConnect.requestPermission({
        read: ["activeEnergyBurned", "steps", "restingHeartRate"],
      });
      return true;
    } catch {
      return false;
    }
  }

  async getDailySummary(date: string): Promise<DailySummary> {
    if (!HealthConnect) return { source: "healthconnect" };
    try {
      const res = await HealthConnect.readDailyTotals({ date });
      return {
        source: "healthconnect",
        activeEnergyKcal: res.activeEnergyBurned ?? undefined,
        steps: res.steps ?? undefined,
        restingHeartRate: res.restingHeartRate ?? undefined,
      };
    } catch {
      return { source: "healthconnect" };
    }
  }
}

