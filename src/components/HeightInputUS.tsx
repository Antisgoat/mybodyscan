import { useState, useEffect } from "react";
import { cmToIn, ftInToCm, formatHeightFromCm, inToFtIn } from "@/lib/units";
import { Input } from "@/components/ui/input";

type Props = {
  valueCm?: number;
  onChangeCm: (cm: number) => void;
  disabled?: boolean;
};

export default function HeightInputUS({ valueCm, onChangeCm, disabled }: Props) {
  const [ft, setFt] = useState<number>(0);
  const [inch, setInch] = useState<number>(0);

  useEffect(() => {
    if (valueCm != null) {
      const { ft: nextFt, in: nextIn } = inToFtIn(cmToIn(valueCm));
      setFt(nextFt);
      setInch(nextIn);
    }
  }, [valueCm]);

  useEffect(() => {
    onChangeCm(ftInToCm(ft, inch));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ft, inch]);

  return (
    <div className="flex gap-2 items-end">
      <div className="flex flex-col">
        <label className="text-sm">Feet</label>
        <Input
          type="number"
          min={0}
          value={Number.isFinite(ft) ? ft : 0}
          onChange={(e) => {
            const next = parseInt(e.target.value || "0", 10);
            setFt(Number.isNaN(next) ? 0 : next);
          }}
          className="w-20"
          disabled={disabled}
        />
      </div>
      <div className="flex flex-col">
        <label className="text-sm">Inches</label>
        <Input
          type="number"
          min={0}
          max={11}
          value={Number.isFinite(inch) ? inch : 0}
          onChange={(e) => {
            const raw = parseInt(e.target.value || "0", 10);
            const clamped = Math.min(11, Math.max(0, Number.isNaN(raw) ? 0 : raw));
            setInch(clamped);
          }}
          className="w-20"
          disabled={disabled}
        />
      </div>
      <div className="text-xs opacity-70 ml-2">{formatHeightFromCm(valueCm)}</div>
    </div>
  );
}
