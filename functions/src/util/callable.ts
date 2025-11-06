import { onCall, type CallableRequest } from "firebase-functions/v2/https";

export const onCallWithOptionalAppCheck = <T>(
  handler: (req: CallableRequest<any>) => Promise<T> | T,
) => {
  return onCall(
    {
      cors: true,
      enforceAppCheck: process.env.APPCHECK_REQUIRED === "true",
    },
    handler,
  );
};
