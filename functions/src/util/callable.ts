import * as functions from "firebase-functions/v2/https";

export const onCallWithOptionalAppCheck = <T>(handler: functions.CallableRequestHandler<T>) => {
  const enforce = process.env.APPCHECK_REQUIRED === "true";
  return functions.onCall({ region: "us-central1", enforceAppCheck: enforce }, handler);
};
