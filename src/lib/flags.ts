import { getEnv } from "./env";

export const MBS_FLAGS = {
  ENABLE_PUBLIC_MARKETING_PAGE: getEnv("VITE_ENABLE_PUBLIC_MARKETING_PAGE") === 'true',
  SCAN_MODE: getEnv("VITE_SCAN_MODE", "photos"),
  IS_PRODUCTION: window.location.hostname === 'mybodyscanapp.com'
};