import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppHeader } from "@/components/AppHeader";
import { toast } from "@/hooks/use-toast";
import { consumeOneCredit } from "@/lib/payments";
import { useNavigate } from "react-router-dom";

export default function Today() {
  const navigate = useNavigate();

  const handleScan = async () => {
    try {
      await consumeOneCredit();
      toast({ title: "Credit used", description: "Starting scan..." });
      navigate("/scan");
    } catch (err: any) {
      if (err?.message?.includes("No credits")) {
        toast({ 
          title: "No credits available", 
          description: "Purchase credits to continue scanning.",
          variant: "destructive"
        });
        navigate("/plans");
      } else {
        toast({ 
          title: "Error", 
          description: err?.message || "Failed to start scan",
          variant: "destructive" 
        });
      }
    }
  };

  const handleLogMeal = () => {
    toast({ title: "Coming soon", description: "Meal logging will be available soon." });
  };

  const handleLogWorkout = () => {
    toast({ title: "Coming soon", description: "Workout logging will be available soon." });
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="max-w-md mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">Today's Plan</h1>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Workout</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Push-ups: 3x12</li>
              <li>• Squats: 3x15</li>
              <li>• Plank: 3x30s</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Meals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Target: 2,200 calories</p>
            <div className="space-y-2">
              <div className="text-sm">
                <span className="font-medium">Breakfast:</span> Oatmeal with berries (350 cal)
              </div>
              <div className="text-sm">
                <span className="font-medium">Lunch:</span> Grilled chicken salad (500 cal)
              </div>
              <div className="text-sm">
                <span className="font-medium">Dinner:</span> Salmon with vegetables (650 cal)
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Coaching Tip</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Consistency beats perfection. Small daily actions compound into significant results over time.
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-2">
          <Button onClick={handleScan} className="w-full">
            Scan
          </Button>
          <Button variant="secondary" onClick={handleLogMeal} className="w-full">
            Log Meal
          </Button>
          <Button variant="secondary" onClick={handleLogWorkout} className="w-full">
            Log Workout
          </Button>
        </div>
      </main>
    </div>
  );
}