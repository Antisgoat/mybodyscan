// Test allowlist for unlimited credits bypass
export const TEST_WHITELIST = ["developer@adlrlabs.com"];
export const isWhitelisted = (email?: string) => !!email && TEST_WHITELIST.includes(email.toLowerCase());
