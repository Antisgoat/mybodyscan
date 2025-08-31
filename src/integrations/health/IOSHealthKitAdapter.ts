import { Capacitor } from "@capacitor/core";
import { DailySummary, HealthAdapter } from "./HealthAdapter";

export class IOSHealthKitAdapter implements HealthAdapter {
  platform: "ios" = "ios";

  async canImport(): Promise<boolean> {
    return Capacitor.getPlatform() === "ios";
  }

  async requestPermissions(): Promise<boolean> {
    if (Capacitor.getPlatform() !== "ios") return false;
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - dynamic import of potential plugins
      await import("@capgo/capacitor-healthkit");
      return true;
    } catch {
      try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        await import("capacitor-plugin-healthkit");
        return true;
      } catch {
        return false;
      }
    }
  }

  async getDailySummary(date: string): Promise<DailySummary> {
    // TODO: implement real HealthKit query
    return { source: "mock" };
  }
}

