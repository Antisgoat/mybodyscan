import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';

export interface BodyTrendPoint {
  date: string;
  weight: number;
  bodyFat: number;
}

interface BodyTrendChartProps {
  data: BodyTrendPoint[];
}

export function BodyTrendChart({ data }: BodyTrendChartProps) {
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
        <LineChart data={data} margin={{ top: 16, right: 24, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis yAxisId="weight" tick={{ fontSize: 12 }} width={48} label={{ value: 'kg', angle: -90, position: 'insideLeft' }} />
          <YAxis yAxisId="bodyFat" orientation="right" tick={{ fontSize: 12 }} width={48} label={{ value: '%', angle: 90, position: 'insideRight' }} />
          <Tooltip contentStyle={{ fontSize: '0.75rem' }} />
          <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
          <Line yAxisId="weight" type="monotone" dataKey="weight" stroke="hsl(var(--primary))" strokeWidth={2} name="Weight" dot={{ r: 3 }} />
          <Line yAxisId="bodyFat" type="monotone" dataKey="bodyFat" stroke="hsl(var(--accent))" strokeWidth={2} name="Body Fat %" dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
