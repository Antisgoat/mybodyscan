import React from 'react';

export const MBS_ROUTES = [
  { path: '/onboarding-mbs', element: React.createElement((await import('../pages/OnboardingMBS.tsx')).default) }
];