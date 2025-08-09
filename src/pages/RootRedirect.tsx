import { Navigate } from "react-router-dom";
import { auth } from "@/firebaseConfig";

const RootRedirect = () => {
  const user = auth.currentUser;
  return <Navigate to={user ? "/home" : "/auth"} replace />;
};

export default RootRedirect;
