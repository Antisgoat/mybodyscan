import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

const RootRedirect = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (user) navigate("/home", { replace: true });
    else navigate("/auth", { replace: true });
  }, [user, navigate]);
  return null;
};

export default RootRedirect;
