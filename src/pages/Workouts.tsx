import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dumbbell, Plus } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { useI18n } from "@/lib/i18n";

// Mock workout data - in real app, fetch from Firestore
const mockWorkouts = [
  {
    id: "1",
    name: "Push-ups",
    sets: 3,
    reps: 12,
    completed: false,
  },
  {
    id: "2", 
    name: "Squats",
    sets: 3,
    reps: 15,
    completed: false,
  },
  {
    id: "3",
    name: "Plank",
    sets: 3,
    duration: "30s",
    completed: false,
  },
  {
    id: "4",
    name: "Lunges",
    sets: 2,
    reps: 10,
    completed: false,
  }
];

export default function Workouts() {
  const [exercises, setExercises] = useState(mockWorkouts);
  const { t } = useI18n();

  const handleToggleComplete = (id: string) => {
    setExercises(prev =>
      prev.map(exercise =>
        exercise.id === id
          ? { ...exercise, completed: !exercise.completed }
          : exercise
      )
    );
  };

  const completedCount = exercises.filter(ex => ex.completed).length;
  const totalCount = exercises.length;

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Workouts - MyBodyScan" description="Track your daily workout routine" />
      <AppHeader />
      <main className="max-w-md mx-auto p-6 space-y-6">
        <div className="text-center space-y-2">
          <Dumbbell className="w-8 h-8 text-primary mx-auto" />
          <h1 className="text-2xl font-semibold text-foreground">{t('workouts.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {completedCount} of {totalCount} exercises completed
          </p>
        </div>

        <div className="w-full bg-secondary rounded-full h-2">
          <div 
            className="bg-primary h-2 rounded-full transition-all"
            style={{ width: `${(completedCount / totalCount) * 100}%` }}
          />
        </div>

        {exercises.length > 0 ? (
          <div className="space-y-4">
            {exercises.map((exercise) => (
              <Card key={exercise.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id={exercise.id}
                      checked={exercise.completed}
                      onCheckedChange={() => handleToggleComplete(exercise.id)}
                    />
                    <div className="flex-1">
                      <h3 className="font-medium text-foreground">{exercise.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {exercise.sets} sets × {exercise.reps ? `${exercise.reps} reps` : exercise.duration}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <Dumbbell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No workout plan yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Complete your onboarding to get a personalized workout plan
              </p>
              <Button variant="outline" className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                Create Workout Plan
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
      <BottomNav />
    </div>
  );
}