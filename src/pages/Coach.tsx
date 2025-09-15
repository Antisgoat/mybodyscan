import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Seo } from "@/components/Seo";
import { useTranslation } from "@/hooks/useTranslation";
import { useNavigate } from "react-router-dom";

const Coach = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [hasActivePlan, setHasActivePlan] = useState(false);

  if (!hasActivePlan) {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto">
        <Seo title={`${t("coach.title")} – MyBodyScan`} description="AI-powered fitness coaching" />
        
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm">
          {t("notmedicaladvice")}
        </div>

        <h1 className="text-2xl font-semibold mb-4">{t("coach.title")}</h1>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Welcome to AI Coach</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Get personalized workout plans, nutrition guidance, and weekly check-ins tailored to your goals.
            </p>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">Personalized Plans</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">Weekly Adaptations</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">Exercise Library</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">Progress Tracking</Badge>
              </div>
            </div>

            <Button 
              className="w-full mt-4" 
              onClick={() => navigate('/coach/onboarding')}
            >
              {t("coach.onboarding")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sample Workout Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="border rounded p-3">
                <h4 className="font-medium">Upper Body Push Day</h4>
                <p className="text-sm text-muted-foreground">45 minutes • Intermediate</p>
                <div className="mt-2 space-y-1 text-sm">
                  <div>• Bench Press: 4 sets × 8-10 reps</div>
                  <div>• Overhead Press: 3 sets × 10-12 reps</div>
                  <div>• Dips: 3 sets × 8-12 reps</div>
                  <div>• Lateral Raises: 3 sets × 12-15 reps</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Plans adapt weekly based on your progress and feedback
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  // Active plan view (placeholder)
  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Your Training Plan</h1>
      <p>Active plan content would go here...</p>
    </main>
  );
};

export default Coach;