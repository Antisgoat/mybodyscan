import { Navigate } from "react-router-dom";
import { getCachedAuth } from "@/lib/auth";

const RootRedirect = () => {
  const user = getCachedAuth()?.currentUser;
  return <Navigate to={user ? "/home" : "/auth"} replace />;
};

export default RootRedirect;
