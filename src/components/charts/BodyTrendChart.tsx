import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import type { DisplayUnits } from "@/lib/units";

export interface BodyTrendPoint {
  date: string;
  weight: number;
  bodyFat: number;
}

interface BodyTrendChartProps {
  data: BodyTrendPoint[];
  /** Controls labels only; data is expected to already be in the chosen unit. */
  units?: DisplayUnits;
}

export function BodyTrendChart({ data, units = "us" }: BodyTrendChartProps) {
  if (!data.length) {
    return (
      <div className="flex h-48 w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/40 text-sm text-muted-foreground">
        No scan history yet
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <LineChart
          data={data}
          margin={{ top: 16, right: 24, bottom: 8, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis
            yAxisId="weight"
            tick={{ fontSize: 12 }}
            width={48}
            label={{
              value: units === "metric" ? "kg" : "lb",
              angle: -90,
              position: "insideLeft",
            }}
          />
          <YAxis
            yAxisId="bodyFat"
            orientation="right"
            tick={{ fontSize: 12 }}
            width={48}
            label={{ value: "%", angle: 90, position: "insideRight" }}
          />
          <Tooltip
            contentStyle={{ fontSize: "0.75rem" }}
            formatter={(value: number | string, name: string) => {
              if (name.startsWith("Weight")) {
                const numeric =
                  typeof value === "number" ? value : Number(value);
                if (Number.isNaN(numeric)) {
                  return [value, "Weight"];
                }
                return [`${numeric.toFixed(1)} ${units === "metric" ? "kg" : "lb"}`, "Weight"];
              }
              return [value, name];
            }}
          />
          <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
          <Line
            yAxisId="weight"
            type="monotone"
            dataKey="weight"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            name={`Weight (${units === "metric" ? "kg" : "lb"})`}
            dot={{ r: 3 }}
          />
          <Line
            yAxisId="bodyFat"
            type="monotone"
            dataKey="bodyFat"
            stroke="hsl(var(--accent))"
            strokeWidth={2}
            name="Body Fat %"
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
