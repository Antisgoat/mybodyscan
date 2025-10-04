import { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "com.adlrlabs.mybodyscan",
  appName: "MyBodyScan",
  webDir: "dist",
  bundledWebRuntime: false,
  server: { cleartext: false, allowNavigation: ["mybodyscanapp.com","mybodyscan-f3daf.web.app"] }
};
export default config;
