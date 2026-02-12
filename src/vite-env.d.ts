/// <reference types="vite/client" />

interface ImportMeta {
  readonly vitest?: boolean;
}

declare const __NATIVE__: boolean;
declare const __IS_NATIVE__: boolean;
declare const __MBS_NATIVE_RELEASE__: boolean;

interface Window {
  __MBS_RUNTIME_CONFIG__?: {
    VITE_FUNCTIONS_ORIGIN?: string;
    VITE_FUNCTIONS_URL?: string;
    VITE_FUNCTIONS_BASE_URL?: string;
  };
}
