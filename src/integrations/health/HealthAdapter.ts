export type DailySummary = {
  activeEnergyKcal?: number;
  steps?: number;
  restingHeartRate?: number;
  source: "mock" | "healthkit" | "healthconnect" | "googlefit";
};

export interface HealthAdapter {
  platform: "web" | "ios" | "android";
  canImport(): Promise<boolean>;
  requestPermissions(): Promise<boolean>;
  getDailySummary(date: string): Promise<DailySummary>;
}

