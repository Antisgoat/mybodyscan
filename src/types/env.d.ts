/* Augment Vite env typing so code can compile without .env files. */
interface ImportMetaEnv {
  readonly VITE_APPCHECK_SITE_KEY?: string;
  readonly VITE_DEMO_ENABLED?: string;            // "1"/"true" to enable
  readonly VITE_SHOW_APPLE_WEB?: string;          // "1"/"true" to show Apple on web
  readonly VITE_USDA_API_KEY?: string;            // Nutrition
  readonly VITE_OFF_ENABLED?: string;             // "0"/"false" to disable OFF fallback
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;  // Stripe (sandbox ok)
  readonly VITE_SW_ENABLED?: string;              // "1"/"true" to allow SW registration
  readonly VITE_ENABLE_PUBLIC_MARKETING_PAGE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
