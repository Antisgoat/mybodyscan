import { Navigate } from "react-router-dom";
import { auth } from "@app/lib/firebase.ts";

const RootRedirect = () => {
  const user = auth.currentUser;
  return <Navigate to={user ? "/home" : "/auth"} replace />;
};

export default RootRedirect;
