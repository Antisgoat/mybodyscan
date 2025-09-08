import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Utensils, Plus, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/hooks/use-toast";

interface Meal {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  time: string;
}

// Mock data - in real app, fetch from Firestore
const mockMeals: Meal[] = [
  {
    id: "1",
    name: "Oatmeal with berries",
    calories: 350,
    protein: 12,
    carbs: 65,
    fat: 8,
    time: "08:30"
  }
];

const DAILY_TARGET = 2200; // Mock target - should be from user profile

export default function Meals() {
  const [meals, setMeals] = useState<Meal[]>(mockMeals);
  const [isAddingMeal, setIsAddingMeal] = useState(false);
  const [newMeal, setNewMeal] = useState({
    name: "",
    calories: "",
    protein: "",
    carbs: "",
    fat: ""
  });
  const { t } = useI18n();

  const totalCalories = meals.reduce((sum, meal) => sum + meal.calories, 0);
  const remainingCalories = DAILY_TARGET - totalCalories;

  const handleAddMeal = () => {
    if (!newMeal.name || !newMeal.calories) {
      toast({ title: "Missing information", description: "Please enter meal name and calories" });
      return;
    }

    const meal: Meal = {
      id: Date.now().toString(),
      name: newMeal.name,
      calories: parseInt(newMeal.calories),
      protein: parseInt(newMeal.protein) || 0,
      carbs: parseInt(newMeal.carbs) || 0,
      fat: parseInt(newMeal.fat) || 0,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    };

    setMeals(prev => [...prev, meal]);
    setNewMeal({ name: "", calories: "", protein: "", carbs: "", fat: "" });
    setIsAddingMeal(false);
    toast({ title: "Meal added", description: `${meal.name} logged successfully` });
  };

  const handleDeleteMeal = (id: string) => {
    setMeals(prev => prev.filter(meal => meal.id !== id));
    toast({ title: "Meal deleted", description: "Meal removed from log" });
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Meals - MyBodyScan" description="Track your daily calorie intake" />
      <AppHeader />
      <main className="max-w-md mx-auto p-6 space-y-6">
        <div className="text-center space-y-2">
          <Utensils className="w-8 h-8 text-primary mx-auto" />
          <h1 className="text-2xl font-semibold text-foreground">{t('meals.title')}</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center">Daily Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-foreground">{totalCalories}</div>
              <div className="text-sm text-muted-foreground">of {DAILY_TARGET} calories</div>
            </div>
            
            <div className="w-full bg-secondary rounded-full h-3">
              <div 
                className="bg-primary h-3 rounded-full transition-all"
                style={{ width: `${Math.min((totalCalories / DAILY_TARGET) * 100, 100)}%` }}
              />
            </div>
            
            <div className="text-center">
              <span className={`text-sm ${remainingCalories >= 0 ? 'text-muted-foreground' : 'text-warning'}`}>
                {remainingCalories >= 0 ? `${remainingCalories} calories remaining` : `${Math.abs(remainingCalories)} calories over target`}
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Today's Meals</h2>
          <Dialog open={isAddingMeal} onOpenChange={setIsAddingMeal}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Meal
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Log a Meal</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="meal-name">Meal Name</Label>
                  <Input
                    id="meal-name"
                    value={newMeal.name}
                    onChange={(e) => setNewMeal(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Grilled chicken salad"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="calories">Calories</Label>
                    <Input
                      id="calories"
                      type="number"
                      value={newMeal.calories}
                      onChange={(e) => setNewMeal(prev => ({ ...prev, calories: e.target.value }))}
                      placeholder="500"
                    />
                  </div>
                  <div>
                    <Label htmlFor="protein">Protein (g)</Label>
                    <Input
                      id="protein"
                      type="number"
                      value={newMeal.protein}
                      onChange={(e) => setNewMeal(prev => ({ ...prev, protein: e.target.value }))}
                      placeholder="25"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="carbs">Carbs (g)</Label>
                    <Input
                      id="carbs"
                      type="number"
                      value={newMeal.carbs}
                      onChange={(e) => setNewMeal(prev => ({ ...prev, carbs: e.target.value }))}
                      placeholder="45"
                    />
                  </div>
                  <div>
                    <Label htmlFor="fat">Fat (g)</Label>
                    <Input
                      id="fat"
                      type="number"
                      value={newMeal.fat}
                      onChange={(e) => setNewMeal(prev => ({ ...prev, fat: e.target.value }))}
                      placeholder="15"
                    />
                  </div>
                </div>
                <Button onClick={handleAddMeal} className="w-full">
                  Log Meal
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {meals.length > 0 ? (
          <div className="space-y-3">
            {meals.map((meal) => (
              <Card key={meal.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-foreground">{meal.name}</h3>
                        <span className="text-sm text-muted-foreground">{meal.time}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {meal.calories} cal • P: {meal.protein}g • C: {meal.carbs}g • F: {meal.fat}g
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteMeal(meal.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <Utensils className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No meals logged yet</h3>
              <p className="text-sm text-muted-foreground">
                Start tracking your nutrition by logging your first meal
              </p>
            </CardContent>
          </Card>
        )}
      </main>
      <BottomNav />
    </div>
  );
}