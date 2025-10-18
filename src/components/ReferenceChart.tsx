import { useMemo, useState } from "react";

import { findRangeForValue, getSexAgeBands, type LabeledRange, type Sex } from "@app/content/referenceRanges.ts";
import { cn } from "@app/lib/utils.ts";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@app/components/ui/table.tsx";

interface ReferenceChartProps {
  sex?: Sex | string | null;
  age?: number | null;
  bfPct?: number | null;
}

export function ReferenceChart({ sex, age, bfPct }: ReferenceChartProps) {
  const [expanded, setExpanded] = useState(false);

  const ranges = useMemo<LabeledRange[]>(() => {
    if (!sex || age == null) return [];
    const numericAge = Number(age);
    if (!Number.isFinite(numericAge)) return [];
    return getSexAgeBands(String(sex), numericAge);
  }, [age, sex]);

  const chartMin = ranges.length ? ranges[0].min : 0;
  const chartMax = ranges.length ? Math.max(...ranges.map((range) => range.max)) : 1;
  const usableMax = chartMax > chartMin ? chartMax : chartMin + 1;

  const markerPosition = useMemo(() => {
    if (!Number.isFinite(bfPct ?? NaN)) return null;
    const clamped = Math.min(Math.max((bfPct as number), chartMin), usableMax);
    const span = usableMax - chartMin;
    if (span <= 0) return 0;
    return ((clamped - chartMin) / span) * 100;
  }, [bfPct, chartMin, usableMax]);

  const currentRange = useMemo(() => {
    if (!Number.isFinite(bfPct ?? NaN)) return null;
    return findRangeForValue(ranges, bfPct as number);
  }, [bfPct, ranges]);

  if (!ranges.length) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="relative flex h-10 w-full flex-col items-stretch gap-1">
          <div className="relative h-8 w-full overflow-hidden rounded-md border bg-muted/40">
            <div className="flex h-full w-full">
              {ranges.map((range) => {
                const span = range.max - range.min;
                const percent = usableMax - chartMin > 0 ? (span / (usableMax - chartMin)) * 100 : 0;
                return (
                  <div
                    key={`${range.band}-${range.label}`}
                    className={cn(
                      "flex items-center justify-center px-1 text-[10px] font-medium uppercase tracking-wide text-white",
                      range.color,
                    )}
                    style={{ width: `${percent}%` }}
                  >
                    <span className="drop-shadow-sm">{range.label}</span>
                  </div>
                );
              })}
            </div>
            {markerPosition != null ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-1 flex flex-col items-center"
                style={{ left: `calc(${markerPosition}% - 1px)` }}
              >
                <div className="h-5 w-0.5 rounded-full bg-background" />
                <div className="mt-0.5 rounded-full bg-background px-1 text-[10px] font-semibold text-foreground">
                  {Number(bfPct).toFixed(1)}%
                </div>
              </div>
            ) : null}
          </div>
          {currentRange ? (
            <span className="text-[11px] text-muted-foreground">Current range: {currentRange.label}</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {expanded ? "Hide full reference chart" : "See full reference chart"}
        </button>
      </div>
      {expanded ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/3">Range</TableHead>
              <TableHead>Body fat %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranges.map((range) => (
              <TableRow key={`${range.band}-${range.label}-row`}>
                <TableCell className="font-medium">{range.label}</TableCell>
                <TableCell>{formatRange(range.min, range.max)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableCaption>Reference ranges</TableCaption>
        </Table>
      ) : null}
    </div>
  );
}

function formatRange(min: number, max: number): string {
  const roundedMin = Math.round(min);
  const roundedMax = Math.round(max);
  if (roundedMin >= roundedMax) {
    return `${roundedMin}%`;
  }
  return `${roundedMin}–${roundedMax}%`;
}
