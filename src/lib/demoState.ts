import { disableDemoEverywhere as disableDemoAll, enableDemo, get } from "@/state/demo";

export const DEMO_KEYS = ["mbs_demo"] as const;

export function isDemoLocal(): boolean {
  return get().demo;
}

export function enableDemoLocal() {
  enableDemo();
}

export function disableDemoEverywhere(): void {
  disableDemoAll();
}

export function isDemoEffective(authed: boolean): boolean {
  if (authed) return false;
  return get().demo;
}
