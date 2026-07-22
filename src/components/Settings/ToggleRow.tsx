import { useId, type ReactNode } from "react";
import { Switch } from "@/components/ui/switch";

interface ToggleRowProps {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: ToggleRowProps) {
  const labelId = useId();

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex-1">
        <div id={labelId} className="text-sm font-medium text-foreground">
          {label}
        </div>
        {description && (
          <div className="text-xs text-muted-foreground">{description}</div>
        )}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-labelledby={labelId}
      />
    </div>
  );
}
