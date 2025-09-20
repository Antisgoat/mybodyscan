const TODO_LINK = 'https://linear.app/mybodyscan/issue/HEALTH-SHIM';

function logShim(method: string) {
  console.info(`[shim] ${method}() – replace with health connector. TODO: ${TODO_LINK}`);
}

export type HealthProvider = 'apple-health' | 'google-health-connect' | 'manual';

export interface MockHealthConnection {
  provider: HealthProvider;
  status: 'connected' | 'disconnected';
  connectedAt: string;
}

export interface MockSyncResult {
  day: 'today' | 'yesterday';
  steps: number;
  activeCalories: number;
  sleepHours: number;
}

export async function connectMock(provider: HealthProvider): Promise<MockHealthConnection> {
  logShim('connectMock');
  return {
    provider,
    status: 'connected',
    connectedAt: new Date().toISOString(),
  };
}

export async function syncDayMock(day: 'today' | 'yesterday'): Promise<MockSyncResult> {
  logShim('syncDayMock');
  const offset = day === 'today' ? 0 : 1;
  const base = 8000 - offset * 1200;
  return {
    day,
    steps: base,
    activeCalories: 520 - offset * 80,
    sleepHours: Number((7.2 + offset * 0.3).toFixed(1)),
  };
}
