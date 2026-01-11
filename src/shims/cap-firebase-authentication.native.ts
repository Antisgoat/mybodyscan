const DISABLED_MESSAGE =
  "Capacitor Firebase Authentication web shim is disabled on native builds.";

function disabledError(): Error {
  const err = new Error(DISABLED_MESSAGE);
  (err as any).code = "auth/capacitor-firebase-web-disabled";
  return err;
}

// Non-negotiable: fail fast if anything tries to import this module.
throw disabledError();

export function __disabled(): Promise<never> {
  return Promise.reject(disabledError());
}

export default __disabled;
