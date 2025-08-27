import React from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import { useNeedsOnboardingMBS } from '../hooks/useNeedsOnboardingMBS';

export default function OnboardingRedirectMBS({ children }: { children: JSX.Element }) {
  const { loading, needs } = useNeedsOnboardingMBS();
  const loc = useLocation();
  if (loading) return children; // don't block while checking
  if (needs && loc.pathname !== '/onboarding-mbs') {
    return <Navigate to="/onboarding-mbs" replace />;
  }
  return children;
}