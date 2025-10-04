import { logger } from "firebase-functions";
function isEmulator() {
    return process.env.FUNCTIONS_EMULATOR === "true" || process.env.NODE_ENV !== "production";
}
const validatedKeys = new Set();
export function requireEnv(name, context) {
    const value = process.env[name];
    if (!value) {
        const message = `${context}: missing required env var ${name}`;
        logger.error(message);
        if (!isEmulator()) {
            throw new Error(message);
        }
    }
    if (value) {
        validatedKeys.add(name);
        return value;
    }
    return "";
}
export function ensureEnvVars(names, context) {
    for (const name of names) {
        if (validatedKeys.has(name) && process.env[name]) {
            continue;
        }
        requireEnv(name, context);
    }
}
export function reportMissingEnv(name, context) {
    if (process.env[name]) {
        return;
    }
    const message = `${context}: critical secret ${name} is not configured`;
    logger.error(message);
    if (!isEmulator()) {
        throw new Error(message);
    }
}
//# sourceMappingURL=env.js.map