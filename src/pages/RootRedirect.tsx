import { Navigate } from "react-router-dom";
import { getCachedUser } from "@/auth/client";

const RootRedirect = () => {
  return <Navigate to={getCachedUser() ? "/home" : "/auth"} replace />;
};

export default RootRedirect;
