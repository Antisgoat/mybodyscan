import { DailySummary, HealthAdapter } from "./HealthAdapter";

export class WebMockAdapter implements HealthAdapter {
  platform: "web" = "web";

  async canImport(): Promise<boolean> {
    return false;
  }

  async requestPermissions(): Promise<boolean> {
    return false;
  }

  async getDailySummary(date: string): Promise<DailySummary> {
    return { source: "mock" };
  }
}

