import packageJson from "../../package.json" with { type: "json" };

export type AppInfo = {
  version: string;
};

export const appInfo: AppInfo = {
  version: (packageJson as { version?: string })?.version ?? "0.0.0",
};

export const appVersion: string = appInfo.version;
