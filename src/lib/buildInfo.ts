const env = (import.meta as any)?.env ?? {};

export type BuildInfo = {
  commit?: string;
  branch?: string;
  builtAt?: string; // ISO string
  version?: string; // semantic or short tag
};

/** Build metadata with safe defaults; values can be injected via Vite envs. */
export const BUILD: BuildInfo = {
  commit: env.VITE_COMMIT_SHA || env.COMMIT_SHA || "",
  branch: env.VITE_GIT_BRANCH || env.BRANCH || "",
  builtAt: env.VITE_BUILD_TIME || "",
  version: env.VITE_APP_VERSION || "",
};
