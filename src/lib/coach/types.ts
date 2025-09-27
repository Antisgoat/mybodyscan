export type ProgramGoal = "hypertrophy" | "strength" | "cut" | "general";

export type ProgramLevel = "beginner" | "intermediate" | "advanced";

export type ProgramEquipment =
  | "none"
  | "dumbbells"
  | "kettlebells"
  | "barbell"
  | "machines"
  | "bands";

export interface ProgramFaq {
  question: string;
  answer: string;
}

export interface Program {
  id: string;
  title: string;
  goal: ProgramGoal;
  weeks: Week[];
  summary?: string;
  description?: string;
  level?: ProgramLevel;
  equipment?: ProgramEquipment[];
  durationPerSessionMin?: number;
  tags?: string[];
  heroImg?: string;
  faqs?: ProgramFaq[];
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

export interface ExerciseSubstitution {
  name: string;
  reason?: string;
  equipment?: string[];
}

export interface Exercise {
  name: string;
  sets: number;
  reps: string;
  restSec?: number;
  rir?: number;
  tempo?: string;
  substitutions?: ExerciseSubstitution[];
}
