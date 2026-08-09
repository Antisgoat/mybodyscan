import { Target } from "lucide-react";
import {
  PHYSIQUE_SCORE_DISCLOSURE,
  physiqueOverallScore,
  physiquePriorityAreas,
  physiqueScoreItems,
  physiqueStrengthAreas,
} from "@/lib/physiqueScores";

type Props = {
  scores: unknown;
};

export function PhysiqueDevelopmentScores({ scores }: Props) {
  const items = physiqueScoreItems(scores);
  if (!items.length) return null;

  const hasBalancedComparison = items.length >= 4;
  const overall = hasBalancedComparison ? physiqueOverallScore(scores) : null;
  const priorities = hasBalancedComparison
    ? physiquePriorityAreas(scores, 2)
    : [];
  const strengths = hasBalancedComparison
    ? physiqueStrengthAreas(scores, 2)
    : [];

  return (
    <section
      className="rounded-3xl border border-cyan-400/20 bg-cyan-400/[0.04] p-5 md:p-6"
      aria-labelledby="physique-development-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-cyan-300">
            <Target className="h-4 w-4" aria-hidden="true" />
            <p className="text-xs uppercase tracking-widest">
              Development profile
            </p>
          </div>
          <h2
            id="physique-development-heading"
            className="mt-2 text-xl font-semibold"
          >
            Physique development
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            A consistent visual rubric across your scan photos helps highlight
            relative strengths and training priorities over time.
          </p>
        </div>
        {overall != null ? (
          <div className="min-w-20 rounded-2xl border border-white/10 bg-black/20 p-3 text-center">
            <div className="text-2xl font-semibold text-cyan-200">
              {overall}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">
              Overall
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.key}
            className="rounded-2xl border border-white/10 bg-black/10 p-4"
          >
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">{item.label}</span>
              <span className="font-semibold tabular-nums text-cyan-200">
                {item.score}
              </span>
            </div>
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-label={`${item.label} development score`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={item.score}
            >
              <div
                className="h-full rounded-full bg-cyan-300"
                style={{ width: `${item.score}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {strengths.length ? (
          <div className="rounded-xl border border-white/10 p-3 text-sm">
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              Current strengths
            </p>
            <p className="mt-1">
              {strengths.map((item) => item.label).join(" · ")}
            </p>
          </div>
        ) : null}
        {priorities.length ? (
          <div className="rounded-xl border border-white/10 p-3 text-sm">
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              Training priorities
            </p>
            <p className="mt-1">
              {priorities.map((item) => item.label).join(" · ")}
            </p>
          </div>
        ) : null}
      </div>

      <p className="mt-4 text-xs leading-5 text-zinc-500">
        {PHYSIQUE_SCORE_DISCLOSURE}
      </p>
    </section>
  );
}
