import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export interface WorkoutStreakPoint {
  date: string;
  completed: boolean;
}

interface WorkoutStreakChartProps {
  data: WorkoutStreakPoint[];
}

export function WorkoutStreakChart({ data }: WorkoutStreakChartProps) {
  if (!data.length) {
    return (
      <div className="flex h-32 w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/40 text-sm text-muted-foreground">
        No workouts tracked yet
      </div>
    );
  }

  const formatted = data.map((point) => ({
    ...point,
    value: point.completed ? 1 : 0,
  }));

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer>
        <BarChart data={formatted} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={1} angle={-35} textAnchor="end" height={48} />
          <YAxis hide domain={[0, 1]} />
          <Tooltip
            formatter={(value: unknown) => (value ? 'Completed' : 'Missed')}
            labelFormatter={(label) => new Date(label).toLocaleDateString()}
            contentStyle={{ fontSize: '0.75rem' }}
          />
          <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
