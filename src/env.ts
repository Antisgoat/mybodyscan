export const DEMO_MODE: boolean =
  String(import.meta.env.VITE_DEMO_MODE ?? "false").toLowerCase() === "true";
