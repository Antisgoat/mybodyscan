import * as React from "react";
import { getFirebase } from "./firebase";
export function useFirebaseReady() {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => { getFirebase().then(() => setReady(true)); }, []);
  return ready;
}
