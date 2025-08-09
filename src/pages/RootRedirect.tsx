import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

const RootRedirect = () => {
  const { user } = useAuth();
  return <Navigate to={user ? "/home" : "/auth"} replace />;
};

export default RootRedirect;
