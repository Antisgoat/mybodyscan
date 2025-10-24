import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Filter, SlidersHorizontal } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { loadAllPrograms, matchScore, type CatalogEntry, type ProgramMeta } from "@/lib/coach/catalog";
import type { Program, ProgramEquipment, ProgramGoal, ProgramLevel } from "@/lib/coach/types";

const goalLabels: Record<ProgramGoal, string> = {
  hypertrophy: "Hypertrophy",
  strength: "Strength",
  cut: "Cut / Recomp",
  general: "General Fitness",
};

const levelLabels: Record<ProgramLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const EQUIPMENT_OPTIONS: Array<{ value: ProgramEquipment; label: string }> = [
  { value: "none", label: "Bodyweight" },
  { value: "dumbbells", label: "Dumbbells" },
  { value: "kettlebells", label: "Kettlebells" },
  { value: "barbell", label: "Barbell" },
  { value: "machines", label: "Machines" },
  { value: "bands", label: "Bands" },
];

type GoalFilter = "all" | ProgramGoal;
type LevelFilter = "all" | ProgramLevel;

type RankedProgram = {
  entry: CatalogEntry;
  score: number;
};

const hasHeroImage = (meta: ProgramMeta) => Boolean(meta.heroImg);

const equipmentLabel = (value: ProgramEquipment) =>
  EQUIPMENT_OPTIONS.find((option) => option.value === value)?.label ?? value;

const deriveSummary = (program: Program, meta: ProgramMeta) => {
  if (program.summary) return program.summary;
  return `A ${meta.daysPerWeek}-day, ${meta.weeks}-week plan focused on ${goalLabels[meta.goal].toLowerCase()}.`;
};

export default function ProgramsCatalog() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [goalFilter, setGoalFilter] = useState<GoalFilter>("all");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [daysFilter, setDaysFilter] = useState<number | null>(null);
  const [equipmentFilter, setEquipmentFilter] = useState<ProgramEquipment[]>([]);

  useEffect(() => {
    let mounted = true;
    loadAllPrograms()
      .then((items) => {
        if (!mounted) return;
        setEntries(items);
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const hasActiveFilters =
    goalFilter !== "all" || levelFilter !== "all" || daysFilter !== null || equipmentFilter.length > 0;

  const rankedPrograms = useMemo<RankedProgram[]>(() => {
    if (!entries.length) return [];
    return entries
      .map((entry) => ({
        entry,
        score: matchScore(entry.meta, {
          goal: goalFilter !== "all" ? goalFilter : undefined,
          level: levelFilter !== "all" ? levelFilter : undefined,
          days: daysFilter ?? undefined,
          equipment: equipmentFilter.length ? equipmentFilter : undefined,
        }),
      }))
      .filter(({ entry }) => {
        if (goalFilter !== "all" && entry.meta.goal !== goalFilter) return false;
        if (levelFilter !== "all" && entry.meta.level !== levelFilter) return false;
        if (daysFilter !== null && Math.abs(entry.meta.daysPerWeek - daysFilter) > 1) return false;
        if (equipmentFilter.length) {
          const required = entry.meta.equipment.filter((item) => item !== "none");
          if (required.some((item) => !equipmentFilter.includes(item))) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => b.score - a.score);
  }, [entries, goalFilter, levelFilter, daysFilter, equipmentFilter]);

  const toggleEquipment = (value: ProgramEquipment) => {
    setEquipmentFilter((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const resetFilters = () => {
    setGoalFilter("all");
    setLevelFilter("all");
    setDaysFilter(null);
    setEquipmentFilter([]);
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Programs – MyBodyScan" description="Browse structured training programs." />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold text-foreground">Training Programs</h1>
          <p className="text-sm text-muted-foreground">
            Compare programs, filter by your schedule, and find the block that fits your goals.
          </p>
        </div>

        <Card className="border bg-card/60">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Filters</CardTitle>
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Clear all
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Goal</span>
                <Select value={goalFilter} onValueChange={(value) => setGoalFilter(value as GoalFilter)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All goals" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All goals</SelectItem>
                    {Object.entries(goalLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Level</span>
                <Select value={levelFilter} onValueChange={(value) => setLevelFilter(value as LevelFilter)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All levels" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All levels</SelectItem>
                    {Object.entries(levelLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium uppercase tracking-wide text-muted-foreground">Days / Week</span>
                  <button
                    type="button"
                    className="text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => setDaysFilter(null)}
                  >
                    {daysFilter === null ? "Any" : "Clear"}
                  </button>
                </div>
                <div className="space-y-3 rounded-md border bg-muted/40 px-3 py-4">
                  <Slider
                    min={2}
                    max={6}
                    step={1}
                    value={[daysFilter ?? 4]}
                    onValueChange={(value) => setDaysFilter(value[0] ?? null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {daysFilter === null
                      ? "Any schedule"
                      : `${daysFilter} days (±1 day wiggle room)`}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Equipment</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="justify-between">
                      <span>{equipmentFilter.length ? `${equipmentFilter.length} selected` : "Any equipment"}</span>
                      <Filter className="h-4 w-4 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {EQUIPMENT_OPTIONS.map((option) => (
                      <DropdownMenuCheckboxItem
                        key={option.value}
                        checked={equipmentFilter.includes(option.value)}
                        onCheckedChange={() => toggleEquipment(option.value)}
                      >
                        {option.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {equipmentFilter.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {equipmentFilter.map((item) => {
                      const label = EQUIPMENT_OPTIONS.find((option) => option.value === item)?.label ?? item;
                      return (
                        <Badge key={item} variant="secondary" className="capitalize">
                          {label}
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {isLoading ? "Loading programs..." : `${rankedPrograms.length} program${rankedPrograms.length === 1 ? "" : "s"}`}
          </span>
          {hasActiveFilters && <span>Sorted by best match</span>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rankedPrograms.map(({ entry, score }) => {
            const { meta, program } = entry;
            const weeksLabel = meta.weeks === 1 ? "wk" : "wks";
            const sessionLengthLabel = meta.durationPerSessionMin
              ? `${meta.durationPerSessionMin} min`
              : "~45 min";
            const scheduleCaption = `${meta.daysPerWeek} d/wk • ${meta.weeks} ${weeksLabel} • ${sessionLengthLabel}`;
            const hasDeload = Boolean(program.deloadWeeks && program.deloadWeeks.length);
            const equipmentSummary = Array.from(new Set(meta.equipment)).map((item) => equipmentLabel(item)).join(" • ");
            return (
              <Card
                key={meta.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/programs/${meta.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigate(`/programs/${meta.id}`);
                  }
                }}
                className="group flex h-full flex-col overflow-hidden border bg-card/70 transition hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <div className="relative">
                  <AspectRatio ratio={16 / 9}>
                    <div className="relative h-full w-full">
                      {hasHeroImage(meta) ? (
                        <img
                          src={meta.heroImg}
                          alt={program.title}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-br from-primary/25 via-primary/10 to-background" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
                      <div className="absolute bottom-3 left-3 flex flex-wrap gap-2 text-[11px] font-semibold text-foreground">
                        <span className="rounded-full bg-background/80 px-3 py-1 shadow-sm backdrop-blur-sm">
                          {goalLabels[meta.goal]}
                        </span>
                        <span className="rounded-full bg-background/70 px-3 py-1 shadow-sm backdrop-blur-sm">
                          {levelLabels[meta.level]}
                        </span>
                      </div>
                    </div>
                  </AspectRatio>
                </div>
                <div className="flex flex-1 flex-col gap-4 p-5">
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-foreground">{program.title}</h3>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {scheduleCaption}
                    </p>
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {deriveSummary(program, meta)}
                    </p>
                  </div>
                  {program.tags && program.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {program.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-muted px-2 py-1 text-[11px]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-auto flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{equipmentSummary}</span>
                    {hasDeload && <span className="rounded-full bg-muted px-2 py-1 text-[10px] uppercase">Deload built-in</span>}
                    {hasActiveFilters && (
                      <span className="ml-auto font-medium text-primary">Match score: {score}%</span>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
          {!isLoading && !rankedPrograms.length && (
            <Card className="col-span-full border-dashed">
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                No programs match these filters yet. Try widening your equipment or schedule preferences.
              </CardContent>
            </Card>
          )}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
