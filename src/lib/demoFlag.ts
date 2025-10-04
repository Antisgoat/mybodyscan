export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

const DEMO_KEY = "mbs_demo";
export function isDemoActive(): boolean {
  if (DEMO_MODE) return true; // env-enforced demo
  return localStorage.getItem(DEMO_KEY) === "1" || new URLSearchParams(location.search).get("demo") === "1";
}
export function enableDemo() {
  localStorage.setItem(DEMO_KEY, "1");
}
export function disableDemo() {
  localStorage.removeItem(DEMO_KEY);
}
