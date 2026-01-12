import { Navigate } from "react-router-dom";
import { getCachedUser } from "@/auth/mbs-auth";

const RootRedirect = () => {
  return <Navigate to={getCachedUser() ? "/home" : "/auth"} replace />;
};

export default RootRedirect;
