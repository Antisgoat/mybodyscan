export interface Program {
  id: string;
  title: string;
  goal: "hypertrophy" | "strength" | "cut";
  weeks: Week[];
}

export interface Week {
  days: Day[];
}

export interface Day {
  name: string;
  blocks: Block[];
}

export interface Block {
  title: string;
  exercises: Exercise[];
}

export interface Exercise {
  name: string;
  sets: number;
  reps: string;
  restSec?: number;
  rir?: number;
  tempo?: string;
}
