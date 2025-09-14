import React from "react";
import TestModeBanner from "./TestModeBanner";
import BuildTag from "./BuildTag";
import { MBS_FLAGS } from "@/lib/flags";

interface TestModeWrapperProps {
  children: React.ReactNode;
}

export default function TestModeWrapper({ children }: TestModeWrapperProps) {
  return (
    <div>
      {!MBS_FLAGS.IS_PRODUCTION && <TestModeBanner />}
      {children}
      <BuildTag />
    </div>
  );
}