import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CalendarIcon, Plus } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { auth, db } from "@/lib/firebase";
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Seo } from "@/components/Seo";

interface NutritionLog {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meals?: Array<{
    name: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  }>;
}

interface ChartData {
  date: string;
  calories: number;
  target?: number;
}

export default function CoachTrackerNew() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [log, setLog] = useState<NutritionLog>({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [mealForm, setMealForm] = useState({
    name: "",
    calories: "",
    protein_g: "",
    carbs_g: "",
    fat_g: "",
  });
  const [mealDialogOpen, setMealDialogOpen] = useState(false);
  
  const { plan } = useUserProfile();
  const { toast } = useToast();

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const uid = auth.currentUser?.uid;

  // Load daily log
  useEffect(() => {
    if (!uid) return;

    const logRef = doc(db, "users", uid, "nutritionLogs", dateStr);
    const unsubscribe = onSnapshot(logRef, (snapshot) => {
      if (snapshot.exists()) {
        setLog(snapshot.data() as NutritionLog);
      } else {
        setLog({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
      }
    });

    return unsubscribe;
  }, [uid, dateStr]);

  // Load chart data (last 7 days)
  useEffect(() => {
    if (!uid) return;

    const loadChartData = async () => {
      const data: ChartData[] = [];
      const today = new Date();
      
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = format(date, "yyyy-MM-dd");
        
        // Simple promise-based read for chart data
        const logRef = doc(db, "users", uid, "nutritionLogs", dateStr);
        try {
          const snapshot = await new Promise<any>((resolve, reject) => {
            const unsubscribe = onSnapshot(logRef, resolve, reject);
            // Clean up immediately after first read
            setTimeout(() => unsubscribe(), 100);
          });
          
          data.push({
            date: format(date, "MMM dd"),
            calories: snapshot.data()?.calories || 0,
            target: plan?.target_kcal,
          });
        } catch (error) {
          data.push({
            date: format(date, "MMM dd"),
            calories: 0,
            target: plan?.target_kcal,
          });
        }
      }
      
      setChartData(data);
    };

    loadChartData();
  }, [uid, plan]);

  const saveLog = async (newLog: NutritionLog) => {
    if (!uid) return;

    try {
      const logRef = doc(db, "users", uid, "nutritionLogs", dateStr);
      await setDoc(logRef, newLog);
      
      toast({
        title: "Saved",
        description: "Nutrition log updated",
      });
    } catch (error) {
      console.error("Error saving log:", error);
      toast({
        title: "Error",
        description: "Failed to save nutrition log",
        variant: "destructive",
      });
    }
  };

  const addMeal = () => {
    const meal = {
      name: mealForm.name,
      calories: parseInt(mealForm.calories) || 0,
      protein_g: parseInt(mealForm.protein_g) || 0,
      carbs_g: parseInt(mealForm.carbs_g) || 0,
      fat_g: parseInt(mealForm.fat_g) || 0,
    };

    const newLog = {
      calories: log.calories + meal.calories,
      protein_g: log.protein_g + meal.protein_g,
      carbs_g: log.carbs_g + meal.carbs_g,
      fat_g: log.fat_g + meal.fat_g,
      meals: [...(log.meals || []), meal],
    };

    setLog(newLog);
    saveLog(newLog);
    
    setMealForm({ name: "", calories: "", protein_g: "", carbs_g: "", fat_g: "" });
    setMealDialogOpen(false);
  };

  const targetCalories = plan?.target_kcal || 2000;
  const remaining = Math.max(0, targetCalories - log.calories);
  const progressPercent = Math.min(100, (log.calories / targetCalories) * 100);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Seo 
        title="Nutrition Tracker - MyBodyScan"
        description="Track your daily nutrition and calories"
      />
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Nutrition Tracker</h1>
          <p className="text-muted-foreground">Track your daily intake and progress</p>
        </div>
        
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              {format(selectedDate, "MMM dd, yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Daily Progress */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Daily Progress
              <Dialog open={mealDialogOpen} onOpenChange={setMealDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Meal
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Meal</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="meal-name">Meal Name</Label>
                      <Input
                        id="meal-name"
                        placeholder="e.g., Breakfast"
                        value={mealForm.name}
                        onChange={(e) => setMealForm(prev => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="meal-calories">Calories</Label>
                        <Input
                          id="meal-calories"
                          type="number"
                          placeholder="0"
                          value={mealForm.calories}
                          onChange={(e) => setMealForm(prev => ({ ...prev, calories: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label htmlFor="meal-protein">Protein (g)</Label>
                        <Input
                          id="meal-protein"
                          type="number"
                          placeholder="0"
                          value={mealForm.protein_g}
                          onChange={(e) => setMealForm(prev => ({ ...prev, protein_g: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label htmlFor="meal-carbs">Carbs (g)</Label>
                        <Input
                          id="meal-carbs"
                          type="number"
                          placeholder="0"
                          value={mealForm.carbs_g}
                          onChange={(e) => setMealForm(prev => ({ ...prev, carbs_g: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label htmlFor="meal-fat">Fat (g)</Label>
                        <Input
                          id="meal-fat"
                          type="number"
                          placeholder="0"
                          value={mealForm.fat_g}
                          onChange={(e) => setMealForm(prev => ({ ...prev, fat_g: e.target.value }))}
                        />
                      </div>
                    </div>
                    <Button onClick={addMeal} className="w-full">
                      Add Meal
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Calorie Progress */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Calories</span>
                <span>{log.calories} / {targetCalories}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className="bg-primary rounded-full h-2 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="text-sm text-muted-foreground">
                {remaining} calories remaining
              </div>
            </div>

            {/* Macros */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold">{log.protein_g}g</div>
                <div className="text-sm text-muted-foreground">Protein</div>
                {plan && (
                  <div className="text-xs text-muted-foreground">
                    Target: {plan.protein_g}g
                  </div>
                )}
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold">{log.carbs_g}g</div>
                <div className="text-sm text-muted-foreground">Carbs</div>
                {plan && (
                  <div className="text-xs text-muted-foreground">
                    Target: {plan.carbs_g}g
                  </div>
                )}
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold">{log.fat_g}g</div>
                <div className="text-sm text-muted-foreground">Fat</div>
                {plan && (
                  <div className="text-xs text-muted-foreground">
                    Target: {plan.fat_g}g
                  </div>
                )}
              </div>
            </div>

            {/* Meals List */}
            {log.meals && log.meals.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">Today's Meals</h4>
                {log.meals.map((meal, index) => (
                  <div key={index} className="flex justify-between p-2 bg-muted/30 rounded">
                    <span>{meal.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {meal.calories} cal
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 7-Day Chart */}
        <Card>
          <CardHeader>
            <CardTitle>7-Day Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="date" 
                  fontSize={12}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis 
                  fontSize={12}
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)"
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="calories" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--primary))", strokeWidth: 0, r: 4 }}
                />
                {plan?.target_kcal && (
                  <Line 
                    type="monotone" 
                    dataKey="target" 
                    stroke="hsl(var(--muted-foreground))" 
                    strokeWidth={1}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Health Disclaimer */}
      <Card className="border-warning/20 bg-warning/5">
        <CardContent className="pt-6">
          <div className="text-sm text-muted-foreground">
            <strong>Health Note:</strong> Minimum recommended daily intake is 1200 calories. 
            Stay hydrated, get adequate rest, and listen to your body. MyBodyScan is not a medical device.{" "}
            <a href="/legal/disclaimer" className="text-primary hover:underline">
              View full disclaimers
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}