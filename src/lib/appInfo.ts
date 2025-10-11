import packageJson from "../../package.json";

export type AppInfo = {
  version: string;
};

export const appInfo: AppInfo = {
  version: (packageJson as any)?.version ?? "0.0.0",
};

export const appVersion: string = appInfo.version;
