import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthUserMBS } from '../hooks/useAuthUserMBS.ts';

export default function ProtectedRouteMBS({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuthUserMBS();
  
  if (loading) return <div className="p-6 text-slate-500">Loading…</div>;
  
  return user ? children : <Navigate to="/login" replace />;
}