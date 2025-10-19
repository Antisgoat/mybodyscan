export function mapAuthErrorToMessage(code?: string) {
  switch (code) {
    case "auth/invalid-client":
    case "auth/invalid-client-id":
      return "Apple client is misconfigured. Please try again later.";
    case "auth/invalid-redirect-uri":
    case "auth/redirect-uri-mismatch":
      return "Sign-in redirect URL isn’t whitelisted.";
    case "auth/network-request-failed":
      return "Network error. Please try again.";
    default:
      return "Sign-in failed. Please try again.";
  }
}
