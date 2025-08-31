import { Capacitor } from "@capacitor/core";
import { DailySummary, HealthAdapter } from "./HealthAdapter";

export class AndroidHealthConnectAdapter implements HealthAdapter {
  platform: "android" = "android";

  async canImport(): Promise<boolean> {
    return Capacitor.getPlatform() === "android";
  }

  async requestPermissions(): Promise<boolean> {
    if (Capacitor.getPlatform() !== "android") return false;
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - dynamic import placeholder
      await import("@some/health-connect-plugin");
      return true;
    } catch {
      return false;
    }
  }

  async getDailySummary(date: string): Promise<DailySummary> {
    // TODO: implement real Health Connect / Google Fit query
    return { source: "mock" };
  }
}

