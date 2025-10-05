const demoModeRaw = import.meta.env.VITE_DEMO_MODE;
export const DEMO_MODE: boolean = typeof demoModeRaw === "string" && demoModeRaw.toLowerCase() === "true";
