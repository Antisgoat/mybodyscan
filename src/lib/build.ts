export const BUILD = {
  time: (import.meta as any).env?.VITE_BUILD_TIME || "",
  sha: (import.meta as any).env?.VITE_BUILD_SHA || "",
  mode: (import.meta as any).env?.MODE || "",
} as const;
