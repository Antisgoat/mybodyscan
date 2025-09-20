const TODO_LINK = 'https://linear.app/mybodyscan/issue/COACH-SHIM';

function logShim(method: string) {
  console.info(`[shim] ${method}() – replace with AI coach engine. TODO: ${TODO_LINK}`);
}

export interface MockCoachPlanDay {
  name: string;
  focus: string;
  highlight: string;
  notes: string;
}

export interface MockCoachPlan {
  id: string;
  week: number;
  days: MockCoachPlanDay[];
}

export interface MockCoachInput {
  age: number;
  weight: number;
  goal: 'cut' | 'recomp' | 'gain';
}

export async function computePlanMock(input: Partial<MockCoachInput>): Promise<MockCoachPlan> {
  logShim('computePlanMock');
  const goal = input.goal ?? 'recomp';
  return {
    id: `demo-coach-${goal}`,
    week: 1,
    days: [
      { name: 'Monday', focus: 'Strength', highlight: 'Heavy compound lifts', notes: 'Focus on tempo and brace each rep.' },
      { name: 'Wednesday', focus: 'Conditioning', highlight: 'Intervals + Core', notes: 'Add steady-state run if energy is high.' },
      { name: 'Friday', focus: 'Hypertrophy', highlight: 'Upper pump', notes: 'Higher reps with shorter rest periods.' },
    ],
  };
}

export async function getCurrentPlanMock(): Promise<MockCoachPlan | null> {
  logShim('getCurrentPlanMock');
  return computePlanMock({ goal: 'recomp' });
}
