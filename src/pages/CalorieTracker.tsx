import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Search } from "lucide-react";
import { useAuthUser } from "@/lib/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { format } from "date-fns";
import { searchFoods, scaleNutrients, FoodItem } from "@/lib/foodDatabase";
import { useToast } from "@/hooks/use-toast";
import { Seo } from "@/components/Seo";

type Meal = "breakfast" | "lunch" | "dinner" | "snack";
type NutritionEntry = {
  id: string;
  foodId: string;
  name: string;
  brand?: string;
  servingAmount: number;
  servingUnit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  meal: Meal;
};

type DayLog = {
  date: string;
  entries: NutritionEntry[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
};

export default function CalorieTracker() {
  const { user } = useAuthUser();
  const [selectedDate] = useState(new Date());
  const [dayLog, setDayLog] = useState<DayLog>({
    date: format(selectedDate, "yyyy-MM-dd"),
    entries: [],
    totalCalories: 0,
    totalProtein: 0,
    totalCarbs: 0,
    totalFat: 0
  });
  
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FoodItem[]>([]);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [servingAmount, setServingAmount] = useState("1");
  const [selectedMeal, setSelectedMeal] = useState<Meal>("breakfast");
  const [isSearching, setIsSearching] = useState(false);
  
  const { toast } = useToast();
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  // Load day's nutrition log
  useEffect(() => {
    if (!user?.uid) return;

    const loadDayLog = async () => {
      try {
        const logRef = doc(db, "users", user.uid, "nutritionLogs", dateStr);
        const snapshot = await getDoc(logRef);
        
        if (snapshot.exists()) {
          const data = snapshot.data() as DayLog;
          setDayLog(data);
        } else {
          // Initialize empty day
          setDayLog({
            date: dateStr,
            entries: [],
            totalCalories: 0,
            totalProtein: 0,
            totalCarbs: 0,
            totalFat: 0
          });
        }
      } catch (error) {
        console.error("Failed to load nutrition log:", error);
      }
    };

    loadDayLog();
  }, [user, dateStr]);

  // Search foods
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const results = await searchFoods(searchQuery, 10);
      setSearchResults(results);
    } catch (error) {
      toast({ title: "Search failed", description: "Could not search food database", variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  };

  // Add food entry
  const addFoodEntry = async () => {
    if (!selectedFood || !user?.uid) return;

    try {
      const amount = parseFloat(servingAmount);
      if (isNaN(amount) || amount <= 0) {
        toast({ title: "Invalid amount", description: "Please enter a valid serving amount", variant: "destructive" });
        return;
      }

      // Scale nutrients to serving size
      const scaledNutrients = scaleNutrients(selectedFood, amount, selectedFood.serving.unit);
      if (!scaledNutrients) {
        toast({ title: "Invalid serving", description: "Could not calculate nutrition for this serving", variant: "destructive" });
        return;
      }

      const newEntry: NutritionEntry = {
        id: Date.now().toString(),
        foodId: selectedFood.id,
        name: selectedFood.name,
        brand: selectedFood.brand,
        servingAmount: amount,
        servingUnit: selectedFood.serving.unit,
        calories: scaledNutrients.calories,
        protein: scaledNutrients.protein,
        carbs: scaledNutrients.carbs,
        fat: scaledNutrients.fat,
        meal: selectedMeal
      };

      const updatedEntries = [...dayLog.entries, newEntry];
      const newTotals = calculateTotals(updatedEntries);
      
      const updatedLog: DayLog = {
        ...dayLog,
        entries: updatedEntries,
        ...newTotals
      };

      // Save to Firestore
      const logRef = doc(db, "users", user.uid, "nutritionLogs", dateStr);
      await setDoc(logRef, { ...updatedLog, updatedAt: serverTimestamp() });
      
      setDayLog(updatedLog);
      
      // Reset form
      setSelectedFood(null);
      setServingAmount("1");
      setSearchQuery("");
      setSearchResults([]);
      
      toast({ title: "Food added", description: `Added ${newEntry.name} to ${selectedMeal}` });
      
    } catch (error) {
      console.error("Failed to add food entry:", error);
      toast({ title: "Failed to add food", description: "Please try again", variant: "destructive" });
    }
  };

  // Calculate daily totals
  const calculateTotals = (entries: NutritionEntry[]) => {
    return entries.reduce(
      (totals, entry) => ({
        totalCalories: totals.totalCalories + entry.calories,
        totalProtein: totals.totalProtein + entry.protein,
        totalCarbs: totals.totalCarbs + entry.carbs,
        totalFat: totals.totalFat + entry.fat
      }),
      { totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0 }
    );
  };

  const mealEntries = (meal: Meal) => dayLog.entries.filter(e => e.meal === meal);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Seo title="Calorie Tracker - MyBodyScan" description="Track your daily nutrition and calories" />
      
      <div>
        <h1 className="text-3xl font-bold mb-2">Nutrition Tracker</h1>
        <p className="text-muted-foreground">Today: {format(selectedDate, "MMMM d, yyyy")}</p>
      </div>

      {/* Daily Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold">{Math.round(dayLog.totalCalories)}</div>
              <div className="text-sm text-muted-foreground">Calories</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{Math.round(dayLog.totalProtein)}g</div>
              <div className="text-sm text-muted-foreground">Protein</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{Math.round(dayLog.totalCarbs)}g</div>
              <div className="text-sm text-muted-foreground">Carbs</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{Math.round(dayLog.totalFat)}g</div>
              <div className="text-sm text-muted-foreground">Fat</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Food */}
      <Card>
        <CardHeader>
          <CardTitle>Add Food</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search foods..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={isSearching}>
              <Search className="w-4 h-4" />
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {searchResults.map((food) => (
                <div
                  key={food.id}
                  className={`p-3 border rounded cursor-pointer hover:bg-accent ${
                    selectedFood?.id === food.id ? "border-primary bg-primary/5" : ""
                  }`}
                  onClick={() => setSelectedFood(food)}
                >
                  <div className="font-medium">{food.name}</div>
                  {food.brand && <div className="text-sm text-muted-foreground">{food.brand}</div>}
                  <div className="text-xs text-muted-foreground">
                    {food.serving.amount} {food.serving.unit} • {food.nutrients.calories} cal
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedFood && (
            <div className="border rounded p-4 space-y-3">
              <div>
                <strong>{selectedFood.name}</strong>
                {selectedFood.brand && <span className="text-muted-foreground"> - {selectedFood.brand}</span>}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Amount</label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={servingAmount}
                    onChange={(e) => setServingAmount(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Meal</label>
                  <Select value={selectedMeal} onValueChange={(value) => setSelectedMeal(value as Meal)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="breakfast">Breakfast</SelectItem>
                      <SelectItem value="lunch">Lunch</SelectItem>
                      <SelectItem value="dinner">Dinner</SelectItem>
                      <SelectItem value="snack">Snack</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button onClick={addFoodEntry} className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                Add to {selectedMeal}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Meals */}
      <div className="grid gap-4">
        {(['breakfast', 'lunch', 'dinner', 'snack'] as Meal[]).map((meal) => (
          <Card key={meal}>
            <CardHeader>
              <CardTitle className="capitalize flex items-center justify-between">
                {meal}
                <Badge variant="secondary">
                  {mealEntries(meal).reduce((sum, e) => sum + e.calories, 0)} cal
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {mealEntries(meal).length === 0 ? (
                <p className="text-muted-foreground text-sm">No foods added</p>
              ) : (
                <div className="space-y-2">
                  {mealEntries(meal).map((entry) => (
                    <div key={entry.id} className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">{entry.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {entry.servingAmount} {entry.servingUnit}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {entry.calories} cal
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}