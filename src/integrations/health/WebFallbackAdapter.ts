import { DailySummary, HealthAdapter } from "./HealthAdapter.ts";

export class WebFallbackAdapter implements HealthAdapter {
  platform = "web" as const;

  async canImport(): Promise<boolean> {
    return false;
  }

  async requestPermissions(): Promise<boolean> {
    return false;
  }

  async getDailySummary(_date: string): Promise<DailySummary> {
    return { source: "web" };
  }
}

