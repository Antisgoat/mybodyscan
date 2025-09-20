import { ResponsiveContainer, ComposedChart, Area, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';

export interface NutritionDataPoint {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface NutritionMacrosChartProps {
  data: NutritionDataPoint[];
}

export function NutritionMacrosChart({ data }: NutritionMacrosChartProps) {
  if (!data.length) {
    return (
      <div className="flex h-48 w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/40 text-sm text-muted-foreground">
        No nutrition data yet
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 16, right: 12, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="text-muted" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} tickMargin={8} />
          <YAxis yAxisId="calories" tick={{ fontSize: 12 }} width={48} />
          <YAxis yAxisId="macros" orientation="right" tick={{ fontSize: 12 }} width={48} />
          <Tooltip contentStyle={{ fontSize: '0.75rem' }} />
          <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
          <Bar yAxisId="calories" dataKey="calories" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Calories" />
          <Area
            yAxisId="macros"
            type="monotone"
            dataKey="protein"
            stroke="hsl(var(--accent))"
            fill="hsl(var(--accent) / 0.2)"
            name="Protein (g)"
          />
          <Line
            yAxisId="macros"
            type="monotone"
            dataKey="carbs"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={2}
            name="Carbs (g)"
          />
          <Line
            yAxisId="macros"
            type="monotone"
            dataKey="fat"
            stroke="hsl(var(--secondary-foreground))"
            strokeDasharray="4 4"
            name="Fat (g)"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
