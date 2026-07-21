import { onCall, type CallableRequest } from "firebase-functions/v2/https";

type CallableOptions = Parameters<typeof onCall>[0];

export const shouldEnforceAppCheck = (
  mode = process.env.APP_CHECK_MODE
): boolean =>
  String(mode || "soft")
    .trim()
    .toLowerCase() === "strict";

export const onCallWithOptionalAppCheck = <T>(
  handler: (req: CallableRequest<any>) => Promise<T> | T,
  options: Omit<CallableOptions, "enforceAppCheck"> = {}
) => {
  return onCall(
    {
      ...options,
      cors: true,
      enforceAppCheck: shouldEnforceAppCheck(),
    },
    handler
  );
};
