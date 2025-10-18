import React from "react";
import { disabledIfDemo } from "@app/lib/demoGuard.ts";
import { Button, type ButtonProps } from "@app/components/ui/button.tsx";

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
