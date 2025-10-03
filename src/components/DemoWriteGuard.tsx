import React from "react";
import { disabledIfDemo } from "@/lib/demoGuard";
import { Button, type ButtonProps } from "@/components/ui/button";

type Props = ButtonProps;

export const DemoWriteButton = React.forwardRef<HTMLButtonElement, Props>(
  (props, ref) => {
    const { disabled, title } = disabledIfDemo();
    return (
      <Button
        {...props}
        ref={ref}
        disabled={disabled || props.disabled}
        title={props.title ?? title}
      />
    );
  }
);

DemoWriteButton.displayName = "DemoWriteButton";
