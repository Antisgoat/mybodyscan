import React from "react";
import TestModeBanner from "./TestModeBanner";

interface TestModeWrapperProps {
  children: React.ReactNode;
}

export default function TestModeWrapper({ children }: TestModeWrapperProps) {
  return (
    <div>
      <TestModeBanner />
      {children}
    </div>
  );
}