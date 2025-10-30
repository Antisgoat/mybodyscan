import { isWeb } from "./platform";

const ENABLE_SW = false;

if (isWeb()) {
  (async () => {
    try {
      if (!ENABLE_SW && "serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        const hadController = !!navigator.serviceWorker.controller;
        if (regs.length > 0) {
          for (const reg of regs) {
            try {
              await reg.unregister();
            } catch {
              // ignore
            }
          }
          try {
            if ("caches" in window) {
              const keys = await caches.keys();
              for (const key of keys) {
                if (/^(workbox|firebase-|vite-|app-cache)/i.test(key)) {
                  try {
                    await caches.delete(key);
                  } catch {
                    // ignore
                  }
                }
              }
            }
          } catch {
            // ignore
          }
          if (hadController) {
            setTimeout(() => {
              try {
                location.reload();
              } catch {
                // ignore
              }
            }, 50);
          }
        }
      }
    } catch {
      // ignore outer errors
    }
  })();
}
