import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { NotMedicalAdviceBanner } from "@/components/NotMedicalAdviceBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "@/hooks/use-toast";
import { auth, db } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import type { Program } from "@/lib/coach/types";
import beginnerFullBody from "@/content/programs/beginner-full-body.json";
import upperLower from "@/content/programs/upper-lower.json";
import pushPullLegs from "@/content/programs/push-pull-legs.json";
import { doc, setDoc } from "firebase/firestore";

const PROGRAMS: Program[] = [
  beginnerFullBody as Program,
  upperLower as Program,
  pushPullLegs as Program,
];

const PROGRAM_MAP = PROGRAMS.reduce<Record<string, Program>>((acc, program) => {
  acc[program.id] = program;
  return acc;
}, {});

const DEFAULT_PROGRAM_ID = "beginner-full-body";

const goalCopy: Record<Program["goal"], string> = {
  hypertrophy: "Hypertrophy",
  strength: "Strength",
  cut: "Cut / Recomp",
};

function nextTargetFor(program: Program, lastWeek: number, lastDay: number) {
  if (!program.weeks.length) return { weekIdx: 0, dayIdx: 0 };
  if (lastWeek < 0 || lastDay < 0) return { weekIdx: 0, dayIdx: 0 };
  const safeWeek = Math.min(lastWeek, program.weeks.length - 1);
  const weekDays = program.weeks[safeWeek]?.days.length ?? 0;
  if (weekDays && lastDay + 1 < weekDays) {
    return { weekIdx: safeWeek, dayIdx: lastDay + 1 };
  }
  if (safeWeek + 1 < program.weeks.length) {
    return { weekIdx: safeWeek + 1, dayIdx: 0 };
  }
  const finalWeekDays = program.weeks[safeWeek]?.days.length ?? 1;
  return { weekIdx: safeWeek, dayIdx: Math.min(lastDay, Math.max(finalWeekDays - 1, 0)) };
}

export default function CoachOverview() {
  const { profile } = useUserProfile();
  const navigate = useNavigate();
  const [hydrated, setHydrated] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState<string>(DEFAULT_PROGRAM_ID);
  const [weekIdx, setWeekIdx] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const program = useMemo(() => {
    return PROGRAM_MAP[selectedProgramId] ?? PROGRAM_MAP[DEFAULT_PROGRAM_ID];
  }, [selectedProgramId]);

  const lastWeekForProgram = useMemo(() => {
    if (!profile) return -1;
    if (profile.currentProgramId !== program.id) return -1;
    return typeof profile.lastCompletedWeekIdx === "number" ? profile.lastCompletedWeekIdx : -1;
  }, [profile, program.id]);

  const lastDayForProgram = useMemo(() => {
    if (!profile) return -1;
    if (profile.currentProgramId !== program.id) return -1;
    return typeof profile.lastCompletedDayIdx === "number" ? profile.lastCompletedDayIdx : -1;
  }, [profile, program.id]);

  const nextTarget = useMemo(
    () => nextTargetFor(program, lastWeekForProgram, lastDayForProgram),
    [program, lastWeekForProgram, lastDayForProgram]
  );

  useEffect(() => {
    if (!profile || hydrated) return;
    const profileProgram = profile.currentProgramId && PROGRAM_MAP[profile.currentProgramId]
      ? profile.currentProgramId
      : DEFAULT_PROGRAM_ID;
    setSelectedProgramId(profileProgram);
    const initialWeek =
      profile.currentProgramId === profileProgram && typeof profile.lastCompletedWeekIdx === "number"
        ? Math.min(profile.lastCompletedWeekIdx, (PROGRAM_MAP[profileProgram]?.weeks.length || 1) - 1)
        : 0;
    setWeekIdx(Math.max(0, initialWeek));
    setHydrated(true);
  }, [profile, hydrated]);

  useEffect(() => {
    if (!program.weeks[weekIdx]) {
      setWeekIdx(program.weeks.length ? program.weeks.length - 1 : 0);
    }
  }, [program, weekIdx]);

  const persistProfile = async (partial: Record<string, unknown>) => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      setIsSaving(true);
      await setDoc(doc(db, "users", user.uid, "coach", "profile"), partial, { merge: true });
    } catch (error) {
      toast({ title: "Unable to save preference", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleProgramChange = (value: string) => {
    setSelectedProgramId(value);
    setWeekIdx(0);
    persistProfile({ currentProgramId: value });
  };

  const handlePrevWeek = () => {
    setWeekIdx((idx) => Math.max(0, idx - 1));
  };

  const handleNextWeek = () => {
    setWeekIdx((idx) => Math.min(program.weeks.length - 1, idx + 1));
  };

  const handleOpenDay = (dayIdx: number) => {
    navigate(`/coach/day?programId=${program.id}&week=${weekIdx}&day=${dayIdx}`);
  };

  const currentWeek = program.weeks[weekIdx] ?? program.weeks[0];

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Coach – MyBodyScan" description="Follow your bodybuilding-style program." />
      <AppHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        <NotMedicalAdviceBanner />
        <header className="flex flex-col gap-4 rounded-lg border bg-card/40 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <CalendarDays className="h-4 w-4" />
                Structured Program
              </p>
              <h1 className="mt-1 text-3xl font-semibold">Coach</h1>
              <p className="text-sm text-muted-foreground">
                Dialed-in bodybuilding days with detailed lifts and recovery guidance.
              </p>
            </div>
            <Badge variant="secondary">{goalCopy[program.goal]}</Badge>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={program.id} onValueChange={handleProgramChange} disabled={isSaving}>
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue placeholder="Select program" />
              </SelectTrigger>
              <SelectContent>
                {PROGRAMS.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {program.weeks.length} weeks • {currentWeek?.days.length ?? 0} days this week
            </p>
          </div>
        </header>

        <section className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Current Week</p>
            <p className="text-lg font-semibold">
              Week {weekIdx + 1} of {program.weeks.length}
            </p>
            {nextTarget.weekIdx === weekIdx && (
              <p className="text-xs text-muted-foreground">
                Next up: Day {nextTarget.dayIdx + 1}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePrevWeek} disabled={weekIdx === 0}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextWeek}
              disabled={weekIdx >= program.weeks.length - 1}
            >
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </section>

        <div className="space-y-4">
          {currentWeek?.days.map((day, dayIdx) => {
            const totalExercises = day.blocks.reduce(
              (count, block) => count + block.exercises.length,
              0
            );
            const totalSets = day.blocks.reduce(
              (count, block) =>
                count + block.exercises.reduce((sum, exercise) => sum + exercise.sets, 0),
              0
            );
            const completed =
              lastWeekForProgram > weekIdx ||
              (lastWeekForProgram === weekIdx && lastDayForProgram >= dayIdx);
            const isNextTarget = nextTarget.weekIdx === weekIdx && nextTarget.dayIdx === dayIdx;
            return (
              <Card
                key={dayIdx}
                role="button"
                tabIndex={0}
                onClick={() => handleOpenDay(dayIdx)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleOpenDay(dayIdx);
                  }
                }}
                className={cn(
                  "group cursor-pointer border transition hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50",
                  completed && "border-muted-foreground/40",
                  isNextTarget && "border-primary shadow-sm"
                )}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-xl">{day.name}</CardTitle>
                  {completed ? (
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-primary" /> Completed
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Tap to start</span>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {day.blocks.map((block, blockIdx) => (
                    <div key={blockIdx} className="rounded-md bg-muted/50 p-3">
                      <p className="text-sm font-medium text-foreground">{block.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {block.exercises.map((exercise) => exercise.name).join(" • ")}
                      </p>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{totalExercises} exercises</span>
                    <span>{totalSets} total sets</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
