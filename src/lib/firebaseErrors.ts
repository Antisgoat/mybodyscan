export function getFirebaseErrorCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" ? code : "";
}

export function humanizeFirebaseError(error: unknown): string {
  const code = getFirebaseErrorCode(error);
  switch (code) {
    case "auth/popup-blocked":
      return "Enable popups to continue.";
    case "auth/popup-closed-by-user":
      return "The sign-in popup was closed before completing.";
    case "auth/network-request-failed":
      return "Network request failed. Check your connection and retry.";
    case "auth/account-exists-with-different-credential":
      return "This email is already linked to a different sign-in provider. Sign in with that provider, then link Apple from Settings.";
    case "auth/unauthorized-domain":
      return "This domain isn’t authorized for Firebase Auth. Add it under Authentication → Settings.";
    default: {
      const message = (error as { message?: unknown })?.message;
      if (typeof message === "string" && message.trim().length > 0) {
        return message;
      }
      return "An unexpected authentication error occurred.";
    }
  }
}

export function isProviderConfigurationError(error: unknown): boolean {
  const code = getFirebaseErrorCode(error);
  if (!code) {
    const message = (error as { message?: unknown })?.message;
    if (typeof message === "string") {
      return /CONFIGURATION_NOT_FOUND|not enabled|disabled/i.test(message);
    }
    return false;
  }
  return (
    code.includes("operation-not-allowed") ||
    code.includes("configuration-not-found") ||
    code.includes("invalid-oauth-provider") ||
    code.includes("invalid-oauth-client-id") ||
    code.includes("invalid-provider-id")
  );
}
