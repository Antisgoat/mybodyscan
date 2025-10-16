// Test whitelist for unlimited credits
export const TEST_WHITELIST = ["developer@adlrlabs.com"];

export const isWhitelisted = (email?: string) =>
  !!email && TEST_WHITELIST.includes(email.toLowerCase());