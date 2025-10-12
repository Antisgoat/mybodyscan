export const TEST_WHITELIST = ["developer@adlrlabs.com"];

export function isWhitelisted(email?: string): boolean {
  return !!email && TEST_WHITELIST.includes(email.toLowerCase());
}

