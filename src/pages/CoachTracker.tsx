import { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { format, subDays, addDays } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useUserProfile } from "@/hooks/useUserProfile";
import { ChevronLeft, ChevronRight, Plus, Flame, Target } from "lucide-react";
import { DemoWriteButton } from "@/components/DemoWriteGuard";
import { useAuthUser } from "@/auth/mbs-auth";
import { toast } from "@/hooks/use-toast";
import {
  addMeal as logMeal,
  getDailyLog,
  getNutritionHistory,
  type MealEntry,
} from "@/lib/nutritionBackend";

type ChartPoint = { date: string; calories: number };
const EMPTY_LOG = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

const CoachTracker = () => {
  const { plan } = useUserProfile();
  const { user } = useAuthUser();
  const uid = user?.uid;
  const [selectedDate, setSelectedDate] = useState(new Date());
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const [log, setLog] = useState({
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
  });
  const [mealForm, setMealForm] = useState({
    calories: "",
    protein_g: "",
    carbs_g: "",
    fat_g: "",
  });
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [yesterday, setYesterday] = useState<any>(null);
  const [offset, setOffset] = useState(false);
  const [showMealDialog, setShowMealDialog] = useState(false);

  const readLog = useCallback(async (): Promise<typeof EMPTY_LOG> => {
    if (!uid) {
      return EMPTY_LOG;
    }
    try {
      const data = await getDailyLog(dateStr);
      const totals = (data?.totals as Record<string, unknown>) ?? {};
      return {
        calories: Number(totals.calories) || 0,
        protein_g: Number(totals.protein ?? totals.protein_g) || 0,
        carbs_g: Number(totals.carbs ?? totals.carbs_g) || 0,
        fat_g: Number(totals.fat ?? totals.fat_g) || 0,
      };
    } catch (error) {
      console.warn("coachTracker.loadLog", error);
      return EMPTY_LOG;
    }
  }, [uid, dateStr]);

  const refreshDay = useCallback(async () => {
    const next = await readLog();
    setLog(next);
  }, [readLog]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await readLog();
      if (!cancelled) {
        setLog(next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [readLog]);

  const fetchHistory = useCallback(async (): Promise<ChartPoint[]> => {
    if (!uid) {
      return [];
    }
    try {
      const days = await getNutritionHistory(7, dateStr);
      return days.map((day) => ({
        date: day.date,
        calories: day.totals.calories || 0,
      }));
    } catch (error) {
      console.warn("coachTracker.history", error);
      return [];
    }
  }, [uid, dateStr]);

  const refreshHistory = useCallback(async () => {
    const next = await fetchHistory();
    setChart(next);
  }, [fetchHistory]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await fetchHistory();
      if (!cancelled) {
        setChart(next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchHistory]);

  useEffect(() => {
    if (!uid) {
      setYesterday(null);
      return;
    }
    let cancelled = false;
    const yDay = format(subDays(new Date(), 1), "yyyy-MM-dd");
    getDoc(doc(db, "users", uid, "healthDaily", yDay))
      .then((snap) => {
        if (!cancelled) {
          setYesterday(snap.exists() ? snap.data() : null);
        }
      })
      .catch((error) => {
        console.warn("coachTracker.yesterday", error);
        if (!cancelled) {
          setYesterday(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  async function addMeal() {
    if (!uid) {
      toast({
        title: "Sign in required",
        description: "Sign in to log meals.",
        variant: "destructive",
      });
      return;
    }
    const calories = Number(mealForm.calories) || 0;
    const protein_g = Number(mealForm.protein_g) || 0;
    const carbs_g = Number(mealForm.carbs_g) || 0;
    const fat_g = Number(mealForm.fat_g) || 0;

    if (!calories && !protein_g && !carbs_g && !fat_g) {
      toast({
        title: "Add meal details",
        description: "Enter at least one macro value before saving.",
        variant: "destructive",
      });
      return;
    }

    const mealName = isToday
      ? "Manual meal"
      : `Manual meal (${format(selectedDate, "MMM dd")})`;
    const meal: MealEntry = {
      name: mealName,
      calories,
      protein: protein_g,
      carbs: carbs_g,
      fat: fat_g,
      entrySource: "coach-tracker",
    };

    try {
      await logMeal(dateStr, meal);
      toast({
        title: "Meal logged",
        description: isToday
          ? "Added to today’s totals."
          : `Added to ${format(selectedDate, "MMM dd")}.`,
      });
      setMealForm({ calories: "", protein_g: "", carbs_g: "", fat_g: "" });
      setShowMealDialog(false);
      await refreshDay();
      await refreshHistory();
    } catch (error: any) {
      console.error("coachTracker.addMeal", error);
      toast({
        title: "Unable to log meal",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    }
  }

  const total = log.calories || 0;
  const target = plan?.calorieTarget || 0;
  const adjusted = offset
    ? target + (yesterday?.activeEnergyKcal || 0)
    : target;

  const progressPercent =
    target > 0 ? Math.min((total / adjusted) * 100, 100) : 0;
  const isToday =
    format(selectedDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Nutrition Tracker</h1>
        {yesterday?.activeEnergyKcal && (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Flame className="h-3 w-3" />
            Yesterday: {yesterday.activeEnergyKcal} kcal burned
          </Badge>
        )}
      </div>

      {/* Date Selector */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedDate(subDays(selectedDate, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <div className="font-semibold">
                {isToday ? "Today" : format(selectedDate, "MMM dd, yyyy")}
              </div>
              <div className="text-sm text-muted-foreground">
                {format(selectedDate, "EEEE")}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedDate(addDays(selectedDate, 1))}
              disabled={
                format(selectedDate, "yyyy-MM-dd") >=
                format(new Date(), "yyyy-MM-dd")
              }
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Progress Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Daily Progress
            </CardTitle>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={offset} onCheckedChange={setOffset} />
              Activity offset
            </label>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>
                {total} / {adjusted} calories
              </span>
              <span>{Math.round(progressPercent)}%</span>
            </div>
            <Progress value={progressPercent} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-lg font-semibold text-primary">
                {log.protein_g}g
              </div>
              <div className="text-xs text-muted-foreground">Protein</div>
              {plan && (
                <div className="text-xs text-muted-foreground">
                  Goal: {plan.proteinFloor}g
                </div>
              )}
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-accent">
                {log.fat_g}g
              </div>
              <div className="text-xs text-muted-foreground">Fat</div>
              {plan && (
                <div className="text-xs text-muted-foreground">Goal: —g</div>
              )}
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-warning">
                {log.carbs_g}g
              </div>
              <div className="text-xs text-muted-foreground">Carbs</div>
              {plan && (
                <div className="text-xs text-muted-foreground">Goal: —g</div>
              )}
            </div>
          </div>

          <Dialog open={showMealDialog} onOpenChange={setShowMealDialog}>
            <DialogTrigger asChild>
              <Button className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Add Meal
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a meal</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Calories</label>
                    <Input
                      type="number"
                      value={mealForm.calories}
                      onChange={(e) =>
                        setMealForm({ ...mealForm, calories: e.target.value })
                      }
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Protein (g)</label>
                    <Input
                      type="number"
                      value={mealForm.protein_g}
                      onChange={(e) =>
                        setMealForm({ ...mealForm, protein_g: e.target.value })
                      }
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Carbs (g)</label>
                    <Input
                      type="number"
                      value={mealForm.carbs_g}
                      onChange={(e) =>
                        setMealForm({ ...mealForm, carbs_g: e.target.value })
                      }
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Fat (g)</label>
                    <Input
                      type="number"
                      value={mealForm.fat_g}
                      onChange={(e) =>
                        setMealForm({ ...mealForm, fat_g: e.target.value })
                      }
                      placeholder="0"
                    />
                  </div>
                </div>
                <DemoWriteButton onClick={addMeal} className="w-full">
                  Add to {isToday ? "Today" : format(selectedDate, "MMM dd")}
                </DemoWriteButton>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {/* 7-Day Chart */}
      <Card>
        <CardHeader>
          <CardTitle>7-Day Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart}>
                <XAxis
                  dataKey="date"
                  tickFormatter={(date) => format(new Date(date), "MMM dd")}
                  fontSize={12}
                />
                <YAxis fontSize={12} />
                <Tooltip
                  labelFormatter={(date) =>
                    format(new Date(date), "MMM dd, yyyy")
                  }
                  formatter={(value, name) => [`${value} kcal`, "Calories"]}
                />
                <Line
                  type="monotone"
                  dataKey="calories"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 4 }}
                />
                {target > 0 && (
                  <Line
                    type="monotone"
                    dataKey={() => target}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="5 5"
                    dot={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CoachTracker;
