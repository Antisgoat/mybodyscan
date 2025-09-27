import type { Day, Exercise } from "./types";

interface FlattenedSet {
  exIdx: number;
  set: number;
  name: string;
  targetReps: string;
  restSec?: number;
}

export function flattenDay(day: Day): FlattenedSet[] {
  const rows: FlattenedSet[] = [];
  let globalExerciseIndex = 0;
  day.blocks.forEach((block) => {
    block.exercises.forEach((exercise) => {
      for (let i = 1; i <= exercise.sets; i += 1) {
        rows.push({
          exIdx: globalExerciseIndex,
          set: i,
          name: exercise.name,
          targetReps: exercise.reps,
          restSec: exercise.restSec,
        });
      }
      globalExerciseIndex += 1;
    });
  });
  return rows;
}

export function nextProgressionHint(exercise: Exercise): string {
  const { reps, rir, restSec, tempo } = exercise;
  const rirText = typeof rir === "number" ? ` Aim to finish around ${rir} RIR.` : "";
  const restText = typeof restSec === "number" ? ` Keep rest about ${Math.round(restSec / 30) * 30} sec.` : "";
  const tempoText = tempo ? ` Control tempo (${tempo}).` : "";
  return `Add 2.5–5 lb next week if all sets hit ${reps}.${rirText}${restText}${tempoText}`.trim();
}
