import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

export type AuthUser = { uid: string; email: string } | null;

type AuthContextType = {
  user: AuthUser;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser>(null);

  useEffect(() => {
    const raw = localStorage.getItem("mbs_user");
    if (raw) setUser(JSON.parse(raw));
  }, []);

  useEffect(() => {
    if (user) localStorage.setItem("mbs_user", JSON.stringify(user));
    else localStorage.removeItem("mbs_user");
  }, [user]);

  const signIn = async (email: string, _password: string) => {
    // Placeholder – replace with Firebase Auth
    setUser({ uid: "demo-uid", email });
  };

  const signInWithGoogle = async () => {
    // Placeholder – replace with Firebase Google Auth
    setUser({ uid: "demo-uid", email: "google.user@example.com" });
  };

  const signOut = async () => {
    setUser(null);
  };

  const value = useMemo(() => ({ user, signIn, signInWithGoogle, signOut }), [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
};
