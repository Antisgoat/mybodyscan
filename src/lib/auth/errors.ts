export function mapAuthErrorToMessage(code?: string): string {
  switch (code) {
    case "auth/operation-not-allowed":
      return "Apple sign-in is not enabled for this project.";
    case "auth/invalid-client-id":
    case "auth/invalid-client":
      return "Apple client ID is incorrect. Please contact support.";
    case "auth/invalid-redirect-uri":
    case "auth/redirect-uri-mismatch":
      return "Sign-in redirect URL is not whitelisted. Please contact support.";
    case "auth/network-request-failed":
      return "Network error. Please try again.";
    default:
      return "Sign-in failed. Please try again.";
  }
}
