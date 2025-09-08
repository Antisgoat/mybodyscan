import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { consumeOneCredit } from "@/lib/payments";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/lib/i18n";

export default function Today() {
  const navigate = useNavigate();
  const { t } = useI18n();

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
    navigate("/meals");
  };

  const handleLogWorkout = () => {
    navigate("/workouts");
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Today - MyBodyScan" description="Your daily health and fitness plan" />
      <AppHeader />
      <main className="max-w-md mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-semibold text-foreground">{t('today.title')}</h1>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('today.workout')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Push-ups: 3x12</li>
              <li>• Squats: 3x15</li> 
              <li>• Plank: 3x30s</li>
            </ul>
            <div className="mt-3 text-xs text-muted-foreground">
              0 of 3 exercises completed today
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('today.meals')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Target: 2,200 calories</span>
              <span className="text-sm font-medium">350 / 2,200</span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2">
              <div className="bg-primary h-2 rounded-full" style={{ width: "16%" }} />
            </div>
            <div className="text-xs text-muted-foreground">
              1 meal logged • 1,850 calories remaining
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('today.coachingTip')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Consistency beats perfection. Small daily actions compound into significant results over time.
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-2">
          <Button onClick={handleScan} className="w-full">
            {t('today.scan')}
          </Button>
          <Button variant="secondary" onClick={handleLogMeal} className="w-full">
            {t('today.logMeal')}
          </Button>
          <Button variant="secondary" onClick={handleLogWorkout} className="w-full">
            {t('today.logWorkout')}
          </Button>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}