import { Navigate } from "react-router-dom";
import { getCachedUser } from "@/lib/authFacade";

const RootRedirect = () => {
  return <Navigate to={getCachedUser() ? "/home" : "/auth"} replace />;
};

export default RootRedirect;
